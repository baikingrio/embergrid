// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {EmberGrid} from "../src/EmberGrid.sol";

contract ReentrantWithdrawer {
    EmberGrid public grid;
    bool public attack;

    constructor(EmberGrid grid_) {
        grid = grid_;
    }

    function paint(uint256 pixelId, uint8 color) external payable {
        grid.paint{value: msg.value}(pixelId, color);
    }

    function armAndWithdraw() external {
        attack = true;
        grid.withdraw();
    }

    receive() external payable {
        if (attack) {
            attack = false;
            grid.withdraw();
        }
    }
}

contract RejectingReceiver {
    EmberGrid public grid;

    constructor(EmberGrid grid_) {
        grid = grid_;
    }

    function paint(uint256 pixelId, uint8 color) external payable {
        grid.paint{value: msg.value}(pixelId, color);
    }

    function doWithdraw() external {
        grid.withdraw();
    }

    receive() external payable {
        revert("nope");
    }
}

contract EmberGridRoundTest is Test {
    EmberGrid internal grid;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant BASE_PRICE = 0.01 ether;

    function setUp() public {
        grid = new EmberGrid();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function test_waiting_active_due_settle_nextRound_transitions() public {
        assertEq(grid.lastPainter(), address(0));
        assertEq(grid.endTime(), 0);

        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(0, 1);
        assertEq(grid.lastPainter(), alice);
        assertEq(grid.endTime(), block.timestamp + 180);

        vm.warp(block.timestamp + 179);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(0, 2);
        assertEq(grid.lastPainter(), bob);

        uint256 dueAt = grid.endTime();
        vm.warp(dueAt);
        vm.prank(carol);
        vm.expectRevert(EmberGrid.RoundAwaitingSettle.selector);
        grid.paint{value: 0.015625 ether}(0, 3);

        uint256 poolBefore = grid.prizePool();
        uint256 settlerCredit = (poolBefore * 1) / 100;
        uint256 remainder = poolBefore - settlerCredit;
        uint256 winnerCredit = (remainder * 80) / 100;
        uint256 rollover = remainder - winnerCredit;

        vm.prank(alice);
        grid.settleRound();

        assertEq(grid.lastPainter(), address(0));
        assertEq(grid.endTime(), 0);
        assertEq(grid.roundId(), 1);
        assertEq(grid.prizePool(), rollover);
        assertEq(grid.pendingWithdrawals(alice), 0.0115 ether + settlerCredit);
        assertEq(grid.pendingWithdrawals(bob), winnerCredit);

        (address owner, uint88 price, ) = grid.pixels(0);
        assertEq(owner, bob);
        assertEq(uint256(price), 0.0125 ether);

        vm.prank(carol);
        grid.paint{value: 0.015625 ether}(0, 4);
        assertEq(grid.lastPainter(), carol);
        assertEq(grid.roundId(), 1);
        assertGt(grid.endTime(), 0);
    }

    function test_settle_rejectsWhenNotDue_orDoubleSettle() public {
        vm.expectRevert(EmberGrid.RoundNotDue.selector);
        grid.settleRound();

        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(1, 1);

        vm.expectRevert(EmberGrid.RoundNotDue.selector);
        grid.settleRound();

        vm.warp(grid.endTime());
        grid.settleRound();
        vm.expectRevert(EmberGrid.RoundNotDue.selector);
        grid.settleRound();
    }

    function test_failedPaint_doesNotRefreshTimer() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(2, 1);
        uint256 endBefore = grid.endTime();
        address painterBefore = grid.lastPainter();

        vm.warp(block.timestamp + 10);
        vm.prank(bob);
        vm.expectRevert(EmberGrid.IncorrectPayment.selector);
        grid.paint{value: 1 wei}(2, 2);

        assertEq(grid.endTime(), endBefore);
        assertEq(grid.lastPainter(), painterBefore);
    }

    function test_sameTimestamp_lastSuccessfulPainterWins() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(3, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(3, 2);
        assertEq(grid.lastPainter(), bob);

        vm.prank(carol);
        grid.paint{value: 0.015625 ether}(3, 3);
        assertEq(grid.lastPainter(), carol);
        assertEq(grid.endTime(), block.timestamp + 180);
    }

    function test_withdraw_ceiAndRejectsZero() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(4, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(4, 2);

        vm.prank(carol);
        vm.expectRevert(EmberGrid.NothingToWithdraw.selector);
        grid.withdraw();

        uint256 before = alice.balance;
        vm.prank(alice);
        grid.withdraw();
        assertEq(alice.balance, before + 0.0115 ether);
        assertEq(grid.pendingWithdrawals(alice), 0);

        vm.prank(alice);
        vm.expectRevert(EmberGrid.NothingToWithdraw.selector);
        grid.withdraw();
    }

    function test_reentrantWithdraw_revertsAndKeepsCredit() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(grid);
        vm.deal(address(attacker), 10 ether);

        attacker.paint{value: BASE_PRICE}(5, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(5, 2);

        assertEq(grid.pendingWithdrawals(address(attacker)), 0.0115 ether);

        // Inner reentrancy reverts; low-level transfer surfaces as WithdrawFailed and rolls back.
        vm.expectRevert(EmberGrid.WithdrawFailed.selector);
        attacker.armAndWithdraw();

        assertEq(grid.pendingWithdrawals(address(attacker)), 0.0115 ether);
    }

    function test_rejectingReceiver_cannotBlockOthers() public {
        RejectingReceiver bad = new RejectingReceiver(grid);
        vm.deal(address(bad), 10 ether);

        bad.paint{value: BASE_PRICE}(6, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(6, 2);

        vm.expectRevert(EmberGrid.WithdrawFailed.selector);
        bad.doWithdraw();
        assertEq(grid.pendingWithdrawals(address(bad)), 0.0115 ether);

        // Others can still paint and settle
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(7, 1);
        assertEq(grid.lastPainter(), alice);

        vm.warp(grid.endTime());
        grid.settleRound();
        assertEq(grid.lastPainter(), address(0));
    }

    function test_paintBatch_atomicAndRefreshesOnce() public {
        uint16[] memory ids = new uint16[](3);
        uint8[] memory colors = new uint8[](3);
        ids[0] = 10;
        ids[1] = 11;
        ids[2] = 12;
        colors[0] = 1;
        colors[1] = 2;
        colors[2] = 3;

        uint256 ts = block.timestamp;
        vm.prank(alice);
        grid.paintBatch{value: BASE_PRICE * 3}(ids, colors);

        assertEq(grid.lastPainter(), alice);
        assertEq(grid.endTime(), ts + 180);

        (address o0, , uint8 c0) = grid.pixels(10);
        (address o1, , uint8 c1) = grid.pixels(11);
        assertEq(o0, alice);
        assertEq(o1, alice);
        assertEq(c0, 1);
        assertEq(c1, 2);
        assertEq(grid.prizePool(), BASE_PRICE * 3);
    }

    function test_paintBatch_revertsDuplicatesAndRollsBack() public {
        uint16[] memory ids = new uint16[](2);
        uint8[] memory colors = new uint8[](2);
        ids[0] = 20;
        ids[1] = 20;
        colors[0] = 1;
        colors[1] = 2;

        vm.prank(alice);
        vm.expectRevert(EmberGrid.DuplicatePixelId.selector);
        grid.paintBatch{value: BASE_PRICE * 2}(ids, colors);

        (address owner, , ) = grid.pixels(20);
        assertEq(owner, address(0));
    }

    function test_paintBatch_midInvalid_rollsBackAll() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(30, 1);

        uint16[] memory ids = new uint16[](2);
        uint8[] memory colors = new uint8[](2);
        ids[0] = 31;
        ids[1] = 30;
        colors[0] = 1;
        colors[1] = 2;

        vm.prank(alice);
        vm.expectRevert(EmberGrid.CannotBuyOwnPixel.selector);
        grid.paintBatch{value: BASE_PRICE + 0.0125 ether}(ids, colors);

        (address owner31, , ) = grid.pixels(31);
        assertEq(owner31, address(0));
        assertEq(grid.prizePool(), BASE_PRICE);
    }

    function test_paintBatch_rejectsBadLengths() public {
        uint16[] memory ids = new uint16[](1);
        uint8[] memory colors = new uint8[](2);
        ids[0] = 40;
        colors[0] = 1;
        colors[1] = 2;
        vm.prank(alice);
        vm.expectRevert(EmberGrid.InvalidBatch.selector);
        grid.paintBatch{value: BASE_PRICE}(ids, colors);

        uint16[] memory emptyIds = new uint16[](0);
        uint8[] memory emptyColors = new uint8[](0);
        vm.prank(alice);
        vm.expectRevert(EmberGrid.InvalidBatch.selector);
        grid.paintBatch{value: 0}(emptyIds, emptyColors);
    }

    function test_getPixels_page() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(0, 5);

        (address[] memory owners, uint88[] memory prices, uint8[] memory colors) =
            grid.getPixels(0, 2);
        assertEq(owners.length, 2);
        assertEq(owners[0], alice);
        assertEq(uint256(prices[0]), BASE_PRICE);
        assertEq(colors[0], 5);
        assertEq(owners[1], address(0));

        vm.expectRevert(EmberGrid.InvalidPage.selector);
        grid.getPixels(0, 257);

        vm.expectRevert(EmberGrid.InvalidPage.selector);
        grid.getPixels(4090, 10);
    }

    function test_multiRound_accountingCoveredByBalance() public {
        vm.prank(alice);
        grid.paint{value: BASE_PRICE}(50, 1);
        vm.prank(bob);
        grid.paint{value: 0.0125 ether}(50, 2);

        vm.warp(grid.endTime());
        vm.prank(alice);
        grid.settleRound();

        uint256 pool = grid.prizePool();
        uint256 pending =
            grid.pendingWithdrawals(alice) + grid.pendingWithdrawals(bob);
        assertEq(address(grid).balance, pool + pending);

        vm.prank(alice);
        grid.withdraw();
        pending = grid.pendingWithdrawals(alice) + grid.pendingWithdrawals(bob);
        assertEq(address(grid).balance, grid.prizePool() + pending);
    }
}
