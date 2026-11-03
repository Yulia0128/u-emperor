# 酒馆接口来源与兼容目标

0.7.2 仅改变自有日历浮层：复用一个日历内绝对定位节点，通过透明度过渡切换；异步选择带序号取消，关闭时清理淡出等待和窗口 resize 监听。角色消息、统计与原生 API 依赖不变。DOM 状态播报与日期按钮 aria-describedby 关联，减少动态效果即时切换；移动端坐标按日历边界限制。未新增原生弹窗或全局点击监听。

0.7.1 未新增统计接口；总Token继续合计已有的用户和角色消息 token_count。删除覆盖楼层说明，但保留缺失破折号与部分合计 ≥，不把旧值改称输出 Token。日期点击仅读取当天聚合数据，不下载聊天。语录使用 textContent 替换字段，分类名称中的 HTML 不执行。

云端保存已核对同一官方 1.15.0 提交的 [public/script.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/script.js) `saveSettings` 将 extension_settings 放入完整 payload，POST `/api/settings/save`；[settings.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/settings.js) save 将整份设置写入 request.user.directories.root 的 SETTINGS_FILE，get 读回该账号设置。插件仍调用 ctx.saveSettingsDebounced，未新增 localStorage 作为真实环境持久化来源。单服务器同账号重新加载可取得已保存设置，但此路径没有史册多客户端实时合并，不能宣称多个同时打开的旧页面完全同步。来源置信度 high（固定提交），真实跨设备运行待验收。

0.7.0 史册沿用官方 1.15.0 同一提交的 [public/script.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/script.js) `MESSAGE_SENT(index)`、`MESSAGE_RECEIVED(index,type)` 及 [events.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/scripts/events.js) 的事件常量。原生启用消息 token 计数时把结果写入 `message.extra.token_count`；流式 finish 与非流式消息保存路径在 MESSAGE_RECEIVED 前完成计数。此值是消息 token 计数，不能表示含上下文／世界书／提示词／重试的 API 总消耗。缺失时不补算，不调用分词和模型接口，界面显示覆盖楼层。

史册以固定记录时区和纯日期边界划分周一至周日、自然月、自然年，不按 24 小时硬除天数跨夏令时。只在实时消息事件记录新增楼层、实际陪伴；CHAT_CHANGED 建立当前聊天已有对象基线，排除系统／首条自动开场／重抽／续写，并用角色、存档、消息位置与发送日期去重。原生 CHARACTER_PAGE_LOADED／CHARACTER_DUPLICATED 后对角色列表新增身份做入宫发现，插件导入入口也显式登记；首次加载已有角色不算新人。改名迁移统计，替换同身份不重入宫。未知旧导入时间不用于晋升速度评选。无需新增后端请求，所有史册数据在 schema 1 管理备份中保存；不修改原生消息。来源置信度 high，真实酒馆事件和不同生成模式仍待验收。

0.6.4 将编辑器范围收窄到原生 `description`：一个文本框，保存载荷只有 `avatar`、`description`、`data.description`。仍沿用下述已核对的 1.15.0 merge-attributes 接口、保存前基线核对与保存后读取验证，没有新增原生依赖。性格、场景、示例对话及作者说明不由该编辑器修改。

0.6.3 纠正事件来源：同一 1.15.0 提交 [public/script.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/public/script.js) 的 `$('html').on('touchstart mousedown', …)` 关闭未固定抽屉，触发时机早于 click。之前的模拟用 click，不能覆盖这个缺陷。现在仅在插件自己的根节点和 dialog 停止 pointerdown／mousedown／touchstart／click 冒泡，不取消默认行为，输入、滚动、选择和按钮继续正常；插件外部操作仍交由酒馆处理。模拟检查改用 html touchstart／mousedown 并兼测 click，覆盖抽屉搜索、标签、分类、关闭／遮罩、设置、人设编辑与保存。来源置信度 high，真实用户环境待验收。

扩展设置使用同一源码的 `.inline-drawer-toggle` 委托处理器和 `.inline-drawer`、`.inline-drawer-header`、`.inline-drawer-icon`、`.inline-drawer-content` 结构，折叠由酒馆原生处理，默认收起。插件只添加 scoped 排版，不引入自身黑金字体和按钮样式。封位精简迁移沿用 schema 1，增加 `rankDefaultsVersion: 2`，旧默认分类中的角色转到对应保留分类；自定义名称的旧分类保留。备份恢复同样走规范化并确保未册封、冷宫最后。

0.6.0 的内置人设编辑针对同一 1.15.0 源码基线：`POST /api/characters/merge-attributes` 依据 [characters.js](https://github.com/SillyTavern/SillyTavern/blob/1c0e7ea9556afcc3ae55c888287dff67a6aa42fc/src/endpoints/characters.js) 的 merge-attributes 路由，以及 script.js 的 updateRemoteChatName 调用形状。载荷以 `avatar` 指定文件，只合并用户实际改动的 description/personality/scenario/mes_example/creator_notes；同时更新 V1 对应字段与 data 中字段，作者说明的 V1 对应 creatorcomment。服务端 deepMerge 保留未提交的字段并进行原生卡验证，成功返回文本 OK。插件先读 get 检查基线，再发一次合并请求，随后 get 验证并刷新角色列表；不切换当前角色，不发送聊天保存请求。并发检查是客户端读取后核对，原生接口没有事务版本号，因此不宣称与外部同时编辑完全无竞态。单元测试覆盖未知扩展／世界书保留、聊天标识不变、文本响应、冲突及失败；模拟宿主验证 UI 到适配器完整请求。来源置信度 high，真实酒馆保存仍待验收。

0.6.0 移除聊天正文预览，并停止首页和面板重绘时的整库 JSONL 下载。历史补读仅针对当前打开且缺少已记录初见时间的角色；存档页保留原生列表及消息数读取。未改变原生聊天消息或备份快照格式。首页展示默认关闭，显式保存的设置保留。

0.5.0 的金字塔、横排滚动和分类完整页仅修改插件自有前端。分类页与画廊共享同一角色集合和筛选条件，当前分类、滚动位置不写入角色或聊天。carousel.js 的 DOM 监听、ResizeObserver、IntersectionObserver 与动画帧随所属界面销毁；观察器不可用时仍保留原生滚动与按钮。没有新增酒馆 API 依赖，没有调整 schema 1 管理数据与皇后／冷宫规则。测试证据仍为离线和模拟宿主，真实酒馆的原生拖动／主题叠加／手机触摸需在目标环境验收。

0.4.0 的事件隔离只处理了 click 与 Escape，没有覆盖 1.15.0 html touchstart／mousedown 处理器，旧版模拟也漏掉了这个时机；这项不足在 0.6.3 修正。插件弹窗在 body 的独立层，自有根节点与 dialog 承担事件隔离，保留浏览器关闭当前 dialog 的默认行为，不改写原生监听器或用户固定面板偏好。

时间补读依据同一提交的 `stats.js`（后端及前端）、`characters.js` 与 `chats.js`：原生前端的 first_chat 可能随首次记入统计的消息初始化，后端重建也可能因历史日期解析失败留下 0／未来哨兵值；原生卡片 date_added 来自文件 ctime，复制或替换可能变动。插件通过已使用的 `/api/characters/chats`、`/api/chats/get` 只读消息 `send_date`，补充最早及最近实际互动；忽略自动开场与系统消息，文件修改时间不当成初见。并行上限为两个角色，单角色逐档读取；不调用 stats recreate/update，不改写用户聊天，不复算楼层。来源置信度 high（固定版本源码），运行置信度 medium（单元与模拟宿主），真实环境待验。

0.3.1 浏览器兼容修复：插件不再依赖 `crypto.randomUUID()` 生成 DOM 或封位标识。[该接口具有安全上下文限制](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)，不能假定 HTTP 局域网／IP 访问时可用。本地标识生成器不覆盖全局 crypto、不用于安全令牌，已有角色及封位标识原样保留。已在缺少该方法的 Chrome 模拟环境验证，仍不等同于用户真实酒馆的完整验收。

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
