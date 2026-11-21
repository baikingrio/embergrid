// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {DemoFaucet} from "../src/DemoFaucet.sol";

contract DeployDemoFaucet is Script {
    function run() external returns (DemoFaucet faucet) {
        address owner = vm.envAddress("FAUCET_ADDRESS");
        vm.startBroadcast();
        faucet = new DemoFaucet(owner);
        vm.stopBroadcast();
    }
}
