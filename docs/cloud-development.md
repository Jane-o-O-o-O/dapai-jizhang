# 云开发部署说明

当前小程序的房间共享逻辑使用微信云开发：

- 前端通过 `wx.cloud.callFunction` 调用云函数 `room-api`
- 云函数读写云数据库集合 `poker_rooms`
- 结束房间时额外写入集合 `poker_histories`

## 首次部署

1. 在微信开发者工具里确认已选择云开发环境 `cloud1-d3g82yzmu88423dca`。
2. 在云开发控制台创建数据库集合：
   - `poker_rooms`
   - `poker_histories`
3. 在开发者工具的 `cloudfunctions/room-api` 上右键，必须选择“上传并部署：云端安装依赖”。
4. 在云函数详情里测试调用：

```json
{
  "action": "ping",
  "payload": {}
}
```

成功时会返回 `ok: true` 和 `service: room-api`。

5. 重新编译小程序，创建一个新房间，用另一台手机输入房间号加入。

## 注意

旧版本本地存储里已有的房间不会自动同步到云数据库。跨手机加入时，请使用新版创建出来的新房间号。
