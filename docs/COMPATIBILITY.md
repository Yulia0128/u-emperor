# 酒馆接口来源与兼容目标

0.6.0 的内置人设编辑针对同一 1.15.0 源码基线：`POST /api/characters/merge-attributes` 依据 [characters.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/characters.js) 的 merge-attributes 路由，以及 script.js 的 updateRemoteChatName 调用形状。载荷以 `avatar` 指定文件，只合并用户实际改动的 description/personality/scenario/mes_example/creator_notes；同时更新 V1 对应字段与 data 中字段，作者说明的 V1 对应 creatorcomment。服务端 deepMerge 保留未提交的字段并进行原生卡验证，成功返回文本 OK。插件先读 get 检查基线，再发一次合并请求，随后 get 验证并刷新角色列表；不切换当前角色，不发送聊天保存请求。并发检查是客户端读取后核对，原生接口没有事务版本号，因此不宣称与外部同时编辑完全无竞态。单元测试覆盖未知扩展／世界书保留、聊天标识不变、文本响应、冲突及失败；模拟宿主验证 UI 到适配器完整请求。来源置信度 high，真实酒馆保存仍待验收。

0.6.0 移除聊天正文预览，并停止首页和面板重绘时的整库 JSONL 下载。历史补读仅针对当前打开且缺少已记录初见时间的角色；存档页保留原生列表及消息数读取。未改变原生聊天消息或备份快照格式。首页展示默认关闭，显式保存的设置保留。

0.5.0 的金字塔、横排滚动和分类完整页仅修改插件自有前端。分类页与画廊共享同一角色集合和筛选条件，当前分类、滚动位置不写入角色或聊天。carousel.js 的 DOM 监听、ResizeObserver、IntersectionObserver 与动画帧随所属界面销毁；观察器不可用时仍保留原生滚动与按钮。没有新增酒馆 API 依赖，没有调整 schema 1 管理数据与皇后／冷宫规则。测试证据仍为离线和模拟宿主，真实酒馆的原生拖动／主题叠加／手机触摸需在目标环境验收。

0.4.0 的事件隔离依据同一 1.15.0 提交的 [public/script.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/script.js) 文档 click 处理器，以及 [RossAscends-mods.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/RossAscends-mods.js) 的 Escape 处理器。原生把不在 `.openDrawer` 内且非原生 popup 的点击视作面板外部点击；插件弹窗在 body 的独立层，因此只在插件自有根节点与 dialog 内停止 click 冒泡，Escape 也仅在自有界面内隔离，保留浏览器关闭当前 dialog 的默认行为。没有改写原生监听器或用户固定面板偏好。旧版在带该关闭逻辑的模拟宿主中可复现，新版验证同一路径通过；真实用户酒馆仍待验收。

时间补读依据同一提交的 `stats.js`（后端及前端）、`characters.js` 与 `chats.js`：原生前端的 first_chat 可能随首次记入统计的消息初始化，后端重建也可能因历史日期解析失败留下 0／未来哨兵值；原生卡片 date_added 来自文件 ctime，复制或替换可能变动。插件通过已使用的 `/api/characters/chats`、`/api/chats/get` 只读消息 `send_date`，补充最早及最近实际互动；忽略自动开场与系统消息，文件修改时间不当成初见。并行上限为两个角色，单角色逐档读取；不调用 stats recreate/update，不改写用户聊天，不复算楼层。来源置信度 high（固定版本源码），运行置信度 medium（单元与模拟宿主），真实环境待验。

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

少量明确的 DOM 集成：扩展设置 `#extensions_settings2 / #extensions_settings`，首页 `#chat .welcomePanel`，原生创建 `#rm_button_create`。这些是有意的宿主入口适配，不作为接口失败后的隐式降级。首页和创建入口找不到时保留原生界面／显示错误；核心管理器从扩展设置打开。0.4.1 移除小魔棒扩展菜单入口，设置使用普通文字、原生 checkbox_label 与 menu_button，不加载插件字体或黑金控件样式。启动开关复用管理设置的 enabled 字段。

0.2.0 的原生角色抽屉适配单独在 `native-panel.js` 中实现，依据同一固定提交的 [public/index.html](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/index.html)：`#right-nav-panel`、`#right-nav-panelheader`、`#rightNavDrawerIcon / #unimportantYes`、`#rm_button_characters`。不拦截或替换原生点击处理器；在原生面板内挂载独立节点，以可撤销的 class 隐藏其他直接子节点。保留原生拖动条，原生编辑时临时解除隐藏，禁用时清理挂载与监听并恢复原生内容。已在模拟宿主中验证可见性、原生草稿保留和禁用恢复；真实酒馆的抽屉开合及编辑状态仍待验证。

待实测：角色替换返回标识及原存档指针；新建聊天时间命名碰撞；空首条／不同开场下的 swipe 映射；保存／生成与切换的竞态；删除原生事件及文件列表双重确认；真实主题下的首页、弹层和世界书编辑器切换。
