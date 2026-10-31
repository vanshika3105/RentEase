const RentEase = artifacts.require("RentEase");
const { toWei, toBN } = web3.utils;
const ETH = (n) => toWei(String(n), "ether");
const DAY = 24 * 60 * 60;

async function expectRevert(promise, reason) {
  try {
    await promise;
  } catch (err) {
    if (reason) assert.include(err.message, reason, `Expected revert "${reason}", got: ${err.message}`);
    return;
  }
  assert.fail(`Expected revert${reason ? ` "${reason}"` : ""}`);
}

function rpc(method, params = []) {
  return new Promise((resolve, reject) =>
    web3.currentProvider.send(
      { jsonrpc: "2.0", method, params, id: Date.now() + Math.random() },
      (e, r) => (e ? reject(e) : resolve(r))
    )
  );
}
const increaseTime = async (seconds) => {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
};
const balance = async (a) => toBN(await web3.eth.getBalance(a));

contract("RentEase", (accounts) => {
  const [admin, owner, tenant, stranger] = accounts;
  let app;

  beforeEach(async () => {
    app = await RentEase.new({ from: admin });
    await app.addOwner(owner, "Test Owner", { from: admin });
    await app.addProperty("Flat 101", "Mumbai", { from: owner });
  });

  const makeLease = (months = 2, rent = 1, deposit = 2) =>
    app.createLease(1, tenant, ETH(rent), ETH(deposit), months, "hash123", { from: owner });
  const activate = async (months = 2) => {
    await makeLease(months);
    await app.acceptLease(1, { from: tenant, value: ETH(2) });
  };

  it("assigns roles and handles owner requests", async () => {
    assert.equal((await app.getRole(admin)).toString(), "1");
    assert.equal((await app.getRole(owner)).toString(), "2");
    assert.equal((await app.getRole(tenant)).toString(), "0");
    await app.requestOwnerAccess("Pending Pete", { from: stranger });
    assert.equal((await app.getRole(stranger)).toString(), "3");
    await app.setOwnerStatus(stranger, true, { from: admin });
    assert.equal((await app.getRole(stranger)).toString(), "2");
  });

  it("blocks unauthorised actions", async () => {
    await expectRevert(app.addOwner(stranger, "x", { from: stranger }), "Only admin");
    await expectRevert(app.addProperty("x", "y", { from: stranger }), "Owner not approved");
    await expectRevert(
      app.createLease(1, tenant, ETH(1), ETH(1), 1, "", { from: stranger }),
      "Owner not approved"
    );
    await expectRevert(app.setPaused(true, { from: owner }), "Only admin");
  });

  it("lets an owner create a lease for a tenant", async () => {
    await makeLease();
    const l = await app.getLease(1);
    assert.equal(l.tenant, tenant);
    assert.equal(Number(l.status), 0);
    assert.equal((await app.getLeasesByTenant(tenant)).length, 1);
    await expectRevert(makeLease(), "Property already leased");
  });

  it("rejects invalid tenants", async () => {
    await expectRevert(
      app.createLease(1, owner, ETH(1), ETH(1), 1, "", { from: owner }),
      "Invalid tenant"
    );
  });

  it("holds the deposit in escrow when the tenant accepts", async () => {
    await makeLease();
    await expectRevert(app.acceptLease(1, { from: stranger, value: ETH(2) }), "Only tenant");
    await expectRevert(app.acceptLease(1, { from: tenant, value: ETH(1) }), "Incorrect deposit");
    await app.acceptLease(1, { from: tenant, value: ETH(2) });
    const l = await app.getLease(1);
    assert.equal(Number(l.status), 1);
    assert.equal(l.depositHeld.toString(), ETH(2));
    assert.equal((await balance(app.address)).toString(), ETH(2));
  });

  it("forwards rent to the owner minus the platform fee", async () => {
    await activate();
    const before = await balance(owner);
    await app.payRent(1, { from: tenant, value: ETH(1) });
    const after = await balance(owner);
    assert.equal(after.sub(before).toString(), ETH(0.99));
    assert.equal((await app.platformBalance()).toString(), ETH(0.01));
    assert.equal(Number((await app.getLease(1)).paidMonths), 1);
  });

  it("charges a late fee after the grace period", async () => {
    await activate();
    await increaseTime(6 * DAY);
    const due = await app.getAmountDue(1);
    assert.equal(due.lateFee.toString(), ETH(0.05));
    assert.equal(due.total.toString(), ETH(1.05));
    await expectRevert(app.payRent(1, { from: tenant, value: ETH(1) }), "Incorrect amount");
    await app.payRent(1, { from: tenant, value: ETH(1.05) });
    assert.equal(Number((await app.getLease(1)).paidMonths), 1);
  });

  it("completes a lease and returns the deposit", async () => {
    await activate(2);
    await app.payRent(1, { from: tenant, value: ETH(1) });
    await expectRevert(app.completeLease(1, { from: owner }), "Rent not fully paid");
    await app.payRent(1, { from: tenant, value: ETH(1) });
    await expectRevert(app.payRent(1, { from: tenant, value: ETH(1) }), "All rent paid");
    await app.completeLease(1, { from: owner });
    await expectRevert(app.returnDeposit(1, { from: stranger }), "Only lease owner");

    const before = await balance(tenant);
    await app.returnDeposit(1, { from: owner });
    const after = await balance(tenant);
    assert.equal(after.sub(before).toString(), ETH(2));
    await expectRevert(app.returnDeposit(1, { from: owner }), "No deposit held");
  });

  it("lets the admin resolve a dispute by splitting the deposit", async () => {
    await activate();
    await app.terminateLease(1, { from: tenant });
    await expectRevert(app.raiseDispute(1, "x", { from: stranger }), "Not a participant");
    await app.raiseDispute(1, "Damage to the kitchen", { from: tenant });
    assert.equal(Number((await app.getLease(1)).status), 4);
    assert.equal(await app.disputeReason(1), "Damage to the kitchen");
    await expectRevert(app.resolveDispute(1, ETH(1), { from: owner }), "Only admin");
    await expectRevert(app.resolveDispute(1, ETH(3), { from: admin }), "Share exceeds deposit");

    const t0 = await balance(tenant);
    const o0 = await balance(owner);
    await app.resolveDispute(1, ETH(1.5), { from: admin });
    assert.equal((await balance(tenant)).sub(t0).toString(), ETH(1.5));
    assert.equal((await balance(owner)).sub(o0).toString(), ETH(0.5));
    assert.equal(Number((await app.getLease(1)).status), 2);
  });

  it("lets the owner cancel an unaccepted lease", async () => {
    await makeLease();
    await expectRevert(app.cancelLease(1, { from: stranger }), "Only lease owner");
    await app.cancelLease(1, { from: owner });
    assert.equal(Number((await app.getLease(1)).status), 5);
    await makeLease(); // property is free again
  });

  it("pauses the platform and lets the admin withdraw fees", async () => {
    await activate();
    await app.payRent(1, { from: tenant, value: ETH(1) });
    await app.setPaused(true, { from: admin });
    await expectRevert(app.addProperty("x", "y", { from: owner }), "Platform paused");
    await app.setPaused(false, { from: admin });
    await app.withdrawFees({ from: admin });
    assert.equal((await app.platformBalance()).toString(), "0");
    await expectRevert(app.withdrawFees({ from: admin }), "No fees");
  });
});
