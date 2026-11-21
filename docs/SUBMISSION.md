# EmberGrid 余烬格提交清单

EmberGrid 余烬格是一款 Monad 测试网上的像素领地争夺游戏。玩家以递增价格夺取像素，前任持有者获得合约记录的回款，差额进入全局奖池。每次有效争夺刷新 180 秒倒计时，到期后最后争夺者可领取 80% 奖池，余款滚存。

- 仓库：https://github.com/baikingrio/embergrid
- 测试网合约：[`0x02C88408bd774503101803dC681793b14Ee5847a`](https://testnet.monadvision.com/address/0x02C88408bd774503101803dC681793b14Ee5847a)
- 演示水龙头：[`0x81e72AF58Ac6Cf77902a7901eC83743C2c3248FB`](https://testnet.monadvision.com/address/0x81e72AF58Ac6Cf77902a7901eC83743C2c3248FB)
- 首屏截图：[docs/submission/home.png](submission/home.png)
- 公开演示：https://embergrid-zeta.vercel.app

## 两个演示钱包的覆盖与提现

演示钱包 A `0xd4E9Ab451aE304bA5D456774eF12C5C65D908E8f` 买入像素 3839，演示钱包 B `0xDf79CD191FbEaE2fbeD2E9B117FB6021CE62520b` 以 0.0125 MON 覆盖。A 的可领取余额增加 0.0115 MON，并已提走。

| 步骤 | 交易 |
| --- | --- |
| 结算已到期的一轮 | [`0x18991d9e…`](https://testnet.monadvision.com/tx/0x18991d9ebc860e1e217c698cda63daa4a04751713a60ff5e359e2a85a7b0f278) |
| A 购买 #3839，支付 0.01 MON | [`0x95770f12…`](https://testnet.monadvision.com/tx/0x95770f12da26c563725f5e061b8f34defc32ff647a614f8b3760e3eb06b2c9c7) |
| B 覆盖 #3839，支付 0.0125 MON | [`0xbe1d31c9…`](https://testnet.monadvision.com/tx/0xbe1d31c93c258891b9c554f4af189efe18c28a4c27e02e2af7c038772ad2c894) |
| A 提现 0.0115 MON | [`0x948aea90…`](https://testnet.monadvision.com/tx/0x948aea90c3299b444094f406820a81273be82957a49f30c48ec9a68fa8fa8379) |
