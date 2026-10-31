// Usage: npm run seed   (after `npm run migrate`)
// Account #0 = admin, #1 = owner, #2 = tenant
const RentEase = artifacts.require("RentEase");

module.exports = async function (callback) {
  try {
    const [admin, owner, tenant] = await web3.eth.getAccounts();
    const app = await RentEase.deployed();
    const eth = (n) => web3.utils.toWei(String(n), "ether");

    await app.addOwner(owner, "Demo Owner", { from: admin });
    await app.addProperty("Sunrise Apartments 2BHK", "Andheri West, Mumbai", { from: owner });
    await app.createLease(1, tenant, eth(1), eth(2), 6, "", { from: owner });

    console.log("Seed complete");
    console.log("  Admin  :", admin);
    console.log("  Owner  :", owner);
    console.log("  Tenant :", tenant);
    console.log("  Lease #1 created for the tenant (rent 1 ETH, deposit 2 ETH, 6 months)");
    callback();
  } catch (err) {
    callback(err);
  }
};
