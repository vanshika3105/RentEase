// Approves the owner wallet provided for the local Hardhat demo.
const RentEase = artifacts.require("RentEase");
const OWNER_WALLET = "0x559944EE3584F9cf851F62f44C6958576d78A701";

module.exports = async function (callback) {
  try {
    const [admin] = await web3.eth.getAccounts();
    const app = await RentEase.deployed();
    await app.addOwner(OWNER_WALLET, "Property Owner", { from: admin });
    const role = Number(await app.getRole(OWNER_WALLET));
    if (role !== 2) throw new Error(`Owner approval failed: expected role 2, received ${role}`);
    console.log(`Approved owner wallet: ${OWNER_WALLET} (role ${role})`);
    callback();
  } catch (error) {
    callback(error);
  }
};
