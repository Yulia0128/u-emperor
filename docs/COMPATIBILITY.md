# 酒馆接口来源与兼容目标

0.3.1 浏览器兼容修复：插件不再依赖 `crypto.randomUUID()` 生成 DOM 或妃位标识。[该接口具有安全上下文限制](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)，不能假定 HTTP 局域网／IP 访问时可用。本地标识生成器不覆盖全局 crypto、不用于安全令牌，已有角色及妃位标识原样保留。已在缺少该方法的 Chrome 模拟环境验证，仍不等同于用户真实酒馆的完整验收。

目标：官方 SillyTavern **1.15.0**；源码基线提交 `1c0e7ea9556afcc3ae55c888287dff67a6aa42fc`。此前也只读比较过 1.16.0 的角色选择、聊天切换和替换入口。未对所有中间版本或第三方分支作兼容承诺。

扩展运行在酒馆宿主文档中，非酒馆助手 iframe。依赖酒馆原生前端 ES 模块、上下文、认证请求头和原生后端；无酒馆助手、MVU 或 EJS 依赖。各能力都有错误路径，写操作在生成／保存中拒绝执行。

以下链接固定到已读取的 1.15.0 提交；源码确认仅提供实现依据，运行置信度为 medium，真实运行验证待完成。

| 使用能力 | 来源 |
| --- | --- |
| `getContext`、`extensionSettings`、`saveSettingsDebounced`、`getRequestHeaders`、`getCurrentChatId` | [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/st-context.js) 与 [extensions.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/extensions.js) |
| `selectCharacterById(id, {switchMenu})`、`openCharacterChat(filename)`、`doNewChat({deleteCurrentChat:false})`、`closeCurrentChat()`、`deleteCharacterChatByName(characterId, filename)` | [public/script.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/script.js) |
| `swipe.to(null, 'right', {message, forceMesId:0, forceSwipeId, forceDuration:0})`，用于新建后原生开场切换 | 同上 `swipe` 实现，以及 st-context.js 的 `swipe.to` 暴露 |
| `is_send_press`、`isChatSaving`、`is_group_generating` | 同上；[group-chats.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/group-chats.js) |
| 角色导入／替换请求：`/api/characters/import` 的 FormData `avatar`, `file_type`, `user_name`, `preserved_name`；替换后恢复原存档指针 | script.js 的 `importCharacter`、`updateRemoteChatName`；[characters.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/characters.js) 的 import 与 getPreservedName |
| 下载导入 `/api/content/importURL`，验证 `X-Custom-Content-Type: character` | [content-manager.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/content-manager.js)；Discord 页面没有专用解析器，CDN 直链依照白名单 |
| `/api/characters/chats` 的 `simple` 列表与原生 `chat_items`、`last_mes`、`mes` | characters.js；[chats.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/chats.js) 的 `getChatInfo` |
| 无聊天目录时列表返回 `{error:true}`；改用 `/api/chats/search` 的空 query 确认真正的空列表，不根据旧的 chat_size 猜测 | characters.js 与 chats.js 的 search 路由；search 错误为 HTTP 500 |
| `/api/chats/get` 读取聊天数组，`/api/characters/export` 的 `format:'png'` 导出原生角色 | chats.js、characters.js |
| `/api/stats/get` 返回 avatar 到统计的映射；`user_msg_count`, `date_first_chat`, `date_last_chat` | [stats.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/stats.js) 与 [前端 stats.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/stats.js) |
| `world_info.charLore[].extraBooks`、`loadWorldInfo(name)`、`openWorldInfoEditor(name)` | [world-info.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/world-info.js) |
| `APP_READY`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `CHAT_CHANGED`, `CHARACTER_RENAMED`, `CHARACTER_EDITED`, `CHAT_CREATED`, `CHAT_DELETED` 等 | [events.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/events.js)；使用上下文导出的常量，不手写事件字符串 |

少量明确的 DOM 集成：原生扩展菜单 `#extensionsMenu`，扩展设置 `#extensions_settings2 / #extensions_settings`，首页 `#chat .welcomePanel`，原生创建 `#rm_button_create`。这些是有意的宿主入口适配，不作为接口失败后的隐式降级。首页和创建入口找不到时保留原生界面／显示错误；核心管理器可从设置或菜单打开。

0.2.0 的原生角色抽屉适配单独在 `native-panel.js` 中实现，依据同一固定提交的 [public/index.html](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/index.html)：`#right-nav-panel`、`#right-nav-panelheader`、`#rightNavDrawerIcon / #unimportantYes`、`#rm_button_characters`。不拦截或替换原生点击处理器；在原生面板内挂载独立节点，以可撤销的 class 隐藏其他直接子节点。保留原生拖动条，原生编辑时临时解除隐藏，禁用时清理挂载与监听并恢复原生内容。已在模拟宿主中验证可见性、原生草稿保留和禁用恢复；真实酒馆的抽屉开合及编辑状态仍待验证。

待实测：角色替换返回标识及原存档指针；新建聊天时间命名碰撞；空首条／不同开场下的 swipe 映射；保存／生成与切换的竞态；删除原生事件及文件列表双重确认；真实主题下的首页、弹层和世界书编辑器切换。
