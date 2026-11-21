// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Sends a fixed test-MON drip to a demo address. The server key is the only caller.
contract DemoFaucet {
    uint256 public constant DRIP = 0.2 ether;
    uint256 public constant COOLDOWN = 1 days;

    address public owner;
    mapping(address => uint256) public lastClaim;

    error NotOwner();
    error Cooldown();
    error Insufficient();
    error TransferFailed();

    event Dripped(address indexed to, uint256 amount);

    constructor(address owner_) {
        owner = owner_;
    }

    receive() external payable {}

    function drip(address to) external {
        if (msg.sender != owner) revert NotOwner();
        if (lastClaim[to] != 0 && block.timestamp < lastClaim[to] + COOLDOWN) revert Cooldown();
        if (address(this).balance < DRIP) revert Insufficient();

        lastClaim[to] = block.timestamp;
        (bool ok, ) = to.call{value: DRIP}("");
        if (!ok) revert TransferFailed();

        emit Dripped(to, DRIP);
    }
}
