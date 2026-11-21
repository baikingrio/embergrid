// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {EmberGrid} from "../src/EmberGrid.sol";

contract EmberGridPaintEconomyTest is Test {
    EmberGrid internal grid;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant BASE_PRICE = 0.01 ether;
    uint16 internal constant PIXEL_ID = 0; // (0, 0)

    function setUp() public {
        grid = new EmberGrid();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function test_firstPaint_creditsFullPaymentToPrizePool() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 3);

        (address owner, uint88 price, uint8 color) = grid.pixels(PIXEL_ID);
        assertEq(owner, alice);
        assertEq(uint256(price), BASE_PRICE);
        assertEq(color, 3);
        assertEq(grid.prizePool(), BASE_PRICE);
        assertEq(grid.pendingWithdrawals(alice), 0);
        assertEq(address(grid).balance, BASE_PRICE);
    }

    function test_overwrite_splitsPerPrdExample() public {
        // PRD §3.1: A pays 0.01 → pool 0.01
        // B pays 0.0125 → A credit 0.0115, pool += 0.001 → pool 0.011
        // contract balance 0.0225 while A has not withdrawn
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);

        uint256 overwritePrice = 0.0125 ether;
        vm.prank(bob);
        grid.paint{value: overwritePrice}(PIXEL_ID, 7);

        (address owner, uint88 price, uint8 color) = grid.pixels(PIXEL_ID);
        assertEq(owner, bob);
        assertEq(uint256(price), overwritePrice);
        assertEq(color, 7);
        assertEq(grid.pendingWithdrawals(alice), 0.0115 ether);
        assertEq(grid.prizePool(), 0.011 ether);
        assertEq(address(grid).balance, 0.0225 ether);
    }

    function test_secondOverwrite_matchesPrdContinuation() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(PIXEL_ID, 2);

        // Next cover: 0.015625; B credit 0.014375; pool += 0.00125
        uint256 nextPrice = 0.015625 ether;
        vm.prank(carol);
        grid.paint{value: nextPrice}(PIXEL_ID, 4);

        assertEq(grid.pendingWithdrawals(bob), 0.014375 ether);
        assertEq(grid.prizePool(), 0.01225 ether); // 0.011 + 0.00125
        assertEq(address(grid).balance, 0.0225 ether + nextPrice);
    }

    function test_paint_revertsOnUnderpayment() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);

        vm.prank(bob);
        vm.expectRevert(EmberGrid.IncorrectPayment.selector);
        grid.paint{value: 0.0124 ether}(PIXEL_ID, 2);
    }

    function test_paint_revertsOnOverpayment() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);

        vm.prank(bob);
        vm.expectRevert(EmberGrid.IncorrectPayment.selector);
        grid.paint{value: 0.0126 ether}(PIXEL_ID, 2);
    }

    function test_paint_revertsWhenBuyingOwnPixel() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);

        uint256 next = 0.0125 ether;
        vm.prank(alice);
        vm.expectRevert(EmberGrid.CannotBuyOwnPixel.selector);
        grid.paint{value: next}(PIXEL_ID, 2);
    }

    function test_paint_revertsOnInvalidPixelId() public {
        vm.prank(alice);
        vm.expectRevert(EmberGrid.InvalidPixelId.selector);
        grid.paint{value: BASE_PRICE}(4096, 1);
    }

    function test_paint_revertsOnInvalidColor() public {
        vm.prank(alice);
        vm.expectRevert(EmberGrid.InvalidColor.selector);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 16);
    }

    function test_paint_allowsColorZero() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 0);

        (, , uint8 color) = grid.pixels(PIXEL_ID);
        assertEq(color, 0);
        assertEq(grid.prizePool(), BASE_PRICE);
    }

    function test_quoteNextPrice_matchesCeilFormula() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(PIXEL_ID, 1);

        (address owner, uint256 nextPrice, uint256 previousCredit) = grid.quotePaint(PIXEL_ID);
        assertEq(owner, alice);
        assertEq(nextPrice, 0.0125 ether);
        assertEq(previousCredit, 0.0115 ether);
    }
}
