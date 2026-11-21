// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EmberGrid — pixel territory economy (paint loop for ticket #9)
/// @notice First buy and overwrite pricing; round settle/batch land in later tickets.
contract EmberGrid {
    uint256 public constant CANVAS_SIZE = 64;
    uint256 public constant PIXEL_COUNT = CANVAS_SIZE * CANVAS_SIZE; // 4096
    uint256 public constant BASE_PRICE = 0.01 ether;
    uint8 public constant COLOR_MAX = 15;
    uint256 public constant ROUND_DURATION = 180;

    /// @dev Packed into one storage slot: owner (160) + price (88) + color (8) = 256.
    struct Pixel {
        address owner;
        uint88 price;
        uint8 color;
    }

    mapping(uint256 => Pixel) public pixels;
    mapping(address => uint256) public pendingWithdrawals;

    uint256 public prizePool;
    uint256 public roundId;
    address public lastPainter;
    uint256 public endTime;

    error InvalidPixelId();
    error InvalidColor();
    error IncorrectPayment();
    error CannotBuyOwnPixel();
    error PriceOverflow();
    error RoundAwaitingSettle();

    event Painted(
        uint256 indexed roundId,
        uint256 indexed pixelId,
        address indexed previousOwner,
        address newOwner,
        uint8 color,
        uint256 payment,
        uint256 previousOwnerCredit,
        uint256 prizePoolDelta
    );

    function quotePaint(uint256 pixelId)
        external
        view
        returns (address owner, uint256 nextPrice, uint256 previousOwnerCredit)
    {
        if (pixelId >= PIXEL_COUNT) revert InvalidPixelId();
        Pixel memory pixel = pixels[pixelId];
        owner = pixel.owner;
        if (pixel.owner == address(0)) {
            nextPrice = BASE_PRICE;
            previousOwnerCredit = 0;
        } else {
            nextPrice = _ceilMul(pixel.price, 125);
            previousOwnerCredit = _floorMul(pixel.price, 115);
        }
    }

    function paint(uint256 pixelId, uint8 color) external payable {
        if (pixelId >= PIXEL_COUNT) revert InvalidPixelId();
        if (color > COLOR_MAX) revert InvalidColor();
        if (lastPainter != address(0) && endTime != 0 && block.timestamp >= endTime) {
            revert RoundAwaitingSettle();
        }

        Pixel memory pixel = pixels[pixelId];
        if (pixel.owner == msg.sender) revert CannotBuyOwnPixel();

        uint256 required;
        uint256 previousOwnerCredit;
        uint256 prizePoolDelta;

        if (pixel.owner == address(0)) {
            required = BASE_PRICE;
            previousOwnerCredit = 0;
            prizePoolDelta = required;
        } else {
            required = _ceilMul(pixel.price, 125);
            previousOwnerCredit = _floorMul(pixel.price, 115);
            prizePoolDelta = required - previousOwnerCredit;
        }

        if (msg.value != required) revert IncorrectPayment();
        if (required > type(uint88).max) revert PriceOverflow();

        address previousOwner = pixel.owner;

        pixels[pixelId] = Pixel({
            owner: msg.sender,
            price: uint88(required),
            color: color
        });

        if (previousOwnerCredit > 0) {
            pendingWithdrawals[previousOwner] += previousOwnerCredit;
        }
        prizePool += prizePoolDelta;

        lastPainter = msg.sender;
        endTime = block.timestamp + ROUND_DURATION;

        emit Painted(
            roundId,
            pixelId,
            previousOwner,
            msg.sender,
            color,
            required,
            previousOwnerCredit,
            prizePoolDelta
        );
    }

    function _ceilMul(uint256 value, uint256 numerator) private pure returns (uint256) {
        return (value * numerator + 99) / 100;
    }

    function _floorMul(uint256 value, uint256 numerator) private pure returns (uint256) {
        return (value * numerator) / 100;
    }
}
