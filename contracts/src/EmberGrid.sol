// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EmberGrid — pixel territory contest on Monad
contract EmberGrid {
    uint256 public constant CANVAS_SIZE = 64;
    uint256 public constant PIXEL_COUNT = CANVAS_SIZE * CANVAS_SIZE; // 4096
    uint256 public constant BASE_PRICE = 0.01 ether;
    uint8 public constant COLOR_MAX = 15;
    uint256 public constant ROUND_DURATION = 180;
    uint256 public constant MAX_BATCH = 64;
    uint256 public constant MAX_PAGE = 256;

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

    uint256 private _reentrancyStatus = 1;

    error InvalidPixelId();
    error InvalidColor();
    error IncorrectPayment();
    error CannotBuyOwnPixel();
    error PriceOverflow();
    error RoundAwaitingSettle();
    error RoundNotDue();
    error NothingToWithdraw();
    error WithdrawFailed();
    error InvalidBatch();
    error DuplicatePixelId();
    error InvalidPage();
    error Reentrancy();

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

    event RoundSettled(
        uint256 indexed roundId,
        address indexed winner,
        uint256 winnerCredit,
        uint256 rollover
    );

    event Withdrawn(address indexed account, uint256 amount);

    modifier nonReentrant() {
        if (_reentrancyStatus != 1) revert Reentrancy();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

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

    function getPixels(uint256 start, uint256 count)
        external
        view
        returns (address[] memory owners, uint88[] memory prices, uint8[] memory colors)
    {
        if (count == 0 || count > MAX_PAGE || start + count > PIXEL_COUNT) {
            revert InvalidPage();
        }
        owners = new address[](count);
        prices = new uint88[](count);
        colors = new uint8[](count);
        for (uint256 i = 0; i < count; i++) {
            Pixel memory pixel = pixels[start + i];
            owners[i] = pixel.owner;
            prices[i] = pixel.price;
            colors[i] = pixel.color;
        }
    }

    function paint(uint256 pixelId, uint8 color) external payable {
        _requirePurchasesOpen();
        (uint256 required, , ) = _paintOne(pixelId, color, msg.sender);
        if (msg.value != required) revert IncorrectPayment();
        _refreshRound(msg.sender);
    }

    function paintBatch(uint16[] calldata pixelIds, uint8[] calldata colors) external payable {
        uint256 len = pixelIds.length;
        if (len == 0 || len > MAX_BATCH || len != colors.length) revert InvalidBatch();
        _requirePurchasesOpen();
        _assertNoDuplicateIds(pixelIds);

        uint256 totalRequired;
        for (uint256 i = 0; i < len; i++) {
            (uint256 required, , ) = _paintOne(pixelIds[i], colors[i], msg.sender);
            totalRequired += required;
        }
        if (msg.value != totalRequired) revert IncorrectPayment();
        _refreshRound(msg.sender);
    }

    function settleRound() external {
        if (lastPainter == address(0) || endTime == 0 || block.timestamp < endTime) {
            revert RoundNotDue();
        }

        uint256 pool = prizePool;
        uint256 winnerCredit = (pool * 80) / 100;
        uint256 rollover = pool - winnerCredit;
        address winner = lastPainter;
        uint256 settledRoundId = roundId;

        prizePool = rollover;
        pendingWithdrawals[winner] += winnerCredit;
        roundId = settledRoundId + 1;
        lastPainter = address(0);
        endTime = 0;

        emit RoundSettled(settledRoundId, winner, winnerCredit, rollover);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function _requirePurchasesOpen() private view {
        if (lastPainter != address(0) && endTime != 0 && block.timestamp >= endTime) {
            revert RoundAwaitingSettle();
        }
    }

    function _refreshRound(address painter) private {
        lastPainter = painter;
        endTime = block.timestamp + ROUND_DURATION;
    }

    /// @dev Applies one pixel purchase without refreshing round or checking msg.value.
    function _paintOne(uint256 pixelId, uint8 color, address buyer)
        private
        returns (uint256 required, uint256 previousOwnerCredit, uint256 prizePoolDelta)
    {
        if (pixelId >= PIXEL_COUNT) revert InvalidPixelId();
        if (color > COLOR_MAX) revert InvalidColor();

        Pixel memory pixel = pixels[pixelId];
        if (pixel.owner == buyer) revert CannotBuyOwnPixel();

        if (pixel.owner == address(0)) {
            required = BASE_PRICE;
            previousOwnerCredit = 0;
            prizePoolDelta = required;
        } else {
            required = _ceilMul(pixel.price, 125);
            previousOwnerCredit = _floorMul(pixel.price, 115);
            prizePoolDelta = required - previousOwnerCredit;
        }

        if (required > type(uint88).max) revert PriceOverflow();

        address previousOwner = pixel.owner;
        pixels[pixelId] = Pixel({owner: buyer, price: uint88(required), color: color});

        if (previousOwnerCredit > 0) {
            pendingWithdrawals[previousOwner] += previousOwnerCredit;
        }
        prizePool += prizePoolDelta;

        emit Painted(
            roundId,
            pixelId,
            previousOwner,
            buyer,
            color,
            required,
            previousOwnerCredit,
            prizePoolDelta
        );
    }

    function _assertNoDuplicateIds(uint16[] calldata pixelIds) private pure {
        uint256 len = pixelIds.length;
        for (uint256 i = 0; i < len; i++) {
            for (uint256 j = i + 1; j < len; j++) {
                if (pixelIds[i] == pixelIds[j]) revert DuplicatePixelId();
            }
        }
    }

    function _ceilMul(uint256 value, uint256 numerator) private pure returns (uint256) {
        return (value * numerator + 99) / 100;
    }

    function _floorMul(uint256 value, uint256 numerator) private pure returns (uint256) {
        return (value * numerator) / 100;
    }
}
