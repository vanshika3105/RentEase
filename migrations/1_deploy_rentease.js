const fs = require("fs");
const path = require("path");
const RentEase = artifacts.require("RentEase");

module.exports = async function (deployer, network) {
  await deployer.deploy(RentEase);
  const instance = await RentEase.deployed();

  // Export ABI + address for the React client.
  const out = path.join(__dirname, "..", "frontend", "src", "contracts", "RentEase.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ address: instance.address, network, abi: RentEase.abi }, null, 2)
  );
  console.log(`\nRentEase deployed at ${instance.address}`);
  console.log(`ABI written to ${out}\n`);
};
