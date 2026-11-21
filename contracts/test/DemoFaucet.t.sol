// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DemoFaucet} from "../src/DemoFaucet.sol";

contract DemoFaucetTest is Test {
    DemoFaucet internal faucet;
    address internal owner = makeAddr("owner");
    address internal visitor = makeAddr("visitor");

    function setUp() public {
        faucet = new DemoFaucet(owner);
        vm.deal(address(faucet), 1 ether);
    }

    function test_drip_paysOncePerDay() public {
        vm.prank(owner);
        faucet.drip(visitor);
        assertEq(visitor.balance, 0.2 ether);
        assertEq(address(faucet).balance, 0.8 ether);

        vm.prank(owner);
        vm.expectRevert(DemoFaucet.Cooldown.selector);
        faucet.drip(visitor);

        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        faucet.drip(visitor);
        assertEq(visitor.balance, 0.4 ether);
    }

    function test_drip_rejectsOtherCallersAndEmptyFaucet() public {
        vm.prank(visitor);
        vm.expectRevert(DemoFaucet.NotOwner.selector);
        faucet.drip(visitor);

        DemoFaucet empty = new DemoFaucet(owner);
        vm.prank(owner);
        vm.expectRevert(DemoFaucet.Insufficient.selector);
        empty.drip(visitor);
    }
}
