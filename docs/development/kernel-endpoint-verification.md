# 内核入口改进验收记录

本次基于 feature 分支实现，并参考本地思源源码 1588124974（源码版本 3.8.6）。用户授权后创建独立 Docker 实例进行真实写入，版本 3.8.5。仅在该容器安装、重载测试插件，未改动用户原有思源实例。

## 合并到测试分支后的验证（2026-09-29）

本记录后续章节的容器证据、1380 项测试和产物哈希对应 `feat/kernel-endpoint` 提交 `2888d0b`。合并到 `test/comprehensive-coverage` 时保留测试分支已有的日记及其他扩展 action，并重新生成内核 schema、帮助快照和 API 映射。原有容器证据不能视为合并后新增 action 的逐项实测。

- `SIYUAN_E2E_SKIP=1 pnpm test`：144 个文件、1915 项通过；2 个文件、16 项跳过。跳过的是测试分支原有的真实实例套件，默认依赖的 `127.0.0.1:6807` 未运行，使用其已有环境开关跳过。
- `pnpm build`、`pnpm build:cli`：通过。
- 合并后的 `dist/kernel.js` 通过两份 Goja 冒烟脚本：初始化、14 类静态工具列表、帮助、别名读取、非法预检，以及 App/Skills 协商、Origin 检查、反馈和遥测代理；均为受控宿主测试。
- `pnpm api:audit`：通过；API 映射已按合并后源码更新。
- `tsc --noEmit`：仍失败，包含测试分支原有的配置与 AV 类型诊断；本次未完成与测试分支原始快照的完整诊断对比，不能套用下文 feature 分支的“24 条、无新增”结论。

## 已实现

- 内核共用 TOOL_REGISTRY / defineTool、配置归一化、别名、开关、Zod 校验及帮助资源；schema 在 Node 构建时生成，goja 不运行反射。
- 启用内核时，CLI、stdio、Node HTTP 严格预检/提交选择同一内核协调器；不跨 owner 回退，丢失响应先只读查询原任务，无法恢复才标记 outcome_unknown。运行期间切换 owner 拒绝执行，需要排空、重启并重新预检。
- extension 统一聚合和过滤；识别 annotations.readOnlyHint，按已暴露名称关联可选 capability 元数据，排除自身；预检不转发、调用不重试，支持分页和结果解包。
- 共享 MCP App 工具、HTML、配置及 _meta；会话隔离能力，30 分钟闲置过期，上限 256 会话；现已同时支持现代无会话协议与 legacy 初始化。
- 模板通过 ArrayBuffer multipart 写入内核 putFile API，模板正文默认上限 16 MiB、可配置至 32 MiB，multipart 额外预留 64 KiB（其他工作区写入仍为 8 MiB）；读取走适配器的认证 HTTP 方法，不再依赖 goja 缺失的全局 fetch；只有 404 才作为模板不存在，其他读取失败中止预检，避免错误返回 no_change。JSON 响应检查字节限制。
- pnpm dev 增加 kernel watch；未改变 schema 时不重写生成文件，避免 watcher 自触发。

## 验证

| 检查 | 结果 |
|---|---|
| pnpm test | 117 文件、1380 测试通过（余项补验及响应体超时竞态修复后最终回归） |
| pnpm build / pnpm build:cli | 通过，包含 kernel.js 与 package.zip |
| goja + goja_nodejs/eventloop 执行本次 kernel.js | 初始化、13 类工具列表、action 帮助、别名读取、非法写预检通过；宿主 API 为测试桩 |
| 内核直接预检 → CLI HTTP 提交 → 内核重放 | 自动化通过，底层创建调用恰好 1 次，账本返回 committed；宿主 API 为测试桩 |
| direct CJS / stdio / CLI / Node HTTP 真实读取 system.get_version | 返回 3.8.5 |
| 独立容器：内核预检 → CLI / Node HTTP 提交 → 内核重放 | 真实通过，重放 writeAttempted=false；Node HTTP 使用实际回环 TCP 监听 |
| 独立容器：state / structure / manifest 扰动 | 旧请求均 state_changed、writeAttempted=false；重新预检后提交成功，并读回验证 |
| tsc --noEmit | 原始 HEAD 快照与当前均 24 条既有错误；无新增诊断 |
| skills:check / git diff --check | 通过 |

API 审计测试依赖 sample/siyuan 的固定 v3.8.0/v3.7.3 Git 基线，已用本地源码对象补齐忽略的测试夹具；重新生成两份 API 映射文档，同步失效行号。

goja 验证脚本：`scripts/kernel-goja-smoke.go`。在本地思源 `kernel/` Go 模块目录执行 `go run <插件仓库>/scripts/kernel-goja-smoke.go <插件仓库>/dist/kernel.js`，不会编译或替换思源内核二进制。

## 产物 SHA-256

| 产物 | SHA-256 |
|---|---|
| `dist/kernel.js` | `30641ba342ed86f85c6d9649b2d3fbe9ffa5b03a9e03de4fb9e746a0d2370e63` |
| `dist/mcp-server.cjs` | `ca1eac901a6f6df3b0bd17a9471cd43c0afa7eba0a64903837876684ef02a227` |
| `cli/dist/cli.cjs` | `086f720e6a8941b21635132fffc2e0537d647fc3f96e89db240fb86398cbd1b8` |

## 容器与可回查证据

- 镜像：`b3log/siyuan:v3.8.5`，digest `sha256:d740a1d3ed6b850de3043caf02d3b41e57e0c79b69a8ce2e511588e5e76968c1`。
- 容器：`sisyphus-kernel-live-20260928-201526`；端口仅监听 `127.0.0.1:58602`；数据卷同名加 `-data`，保留用于复用。
- 测试笔记本：`Sisyphus 容器验收 20260928-201526`，ID `20260929111731-3q6nrjg`。
- 保留报告：`/CJS-LIVE-201526`，ID `20260929111740-ht5asp4`；API 回读确认报告内容。该笔记本 SQL 文档清单仅此一份。
- 已清理子文档 `20260929111757-vlogqf7`、移动测试块 `20260929111758-sjz6v48`，模板 `CJS-LIVE-201526.md` 与 `CJS-LIVE-201526-fixed.md`；两份模板 API 读回均 404。
- 原始逐调用结果：本机 `/tmp/sisyphus-docker-live-results.jsonl`；包含 fixture 数据，无认证信息。`/tmp/sisyphus-docker-live-state.json` 为权限 0600 的本机连接信息，不纳入版本库、不输出正文。
- 回归日志：`/tmp/sisyphus-final-test.log`、`/tmp/sisyphus-final-build.log`。最终 kernel.js SHA 与通过 API 读回的容器已安装版本一致。
- SQL 索引更新存在延迟；立即查询曾读取旧父节点/正文，后续查询确认移动与替换均收敛。不得将提交后第一次 SQL 的旧值判作写失败。

| 夹具/类别 | 入口 | 预检/提交/重放 | 扰动 | 读回/清理 |
|---|---|---|---|---|
| 块内容 | 内核→CLI/direct/Node HTTP→内核 | 通过 | state_changed，零写入 | SQL 正确；已删除 |
| 块移动 | 内核→CLI→内核 | 通过 | structure 变化被拒绝 | SQL 父节点正确；已删除 |
| 文本替换 | 内核→direct→内核 | 通过 | manifest 变化被拒绝 | SQL 内容正确；改为报告 |
| 模板新增/覆盖/更新/删除 | 内核→direct/CLI→内核 | 通过 | HTTP 503 拒绝由回归测试覆盖 | 中文读回正确；删除后 404 |
| 报告覆盖写入 | 内核 | 通过 | 未单独扰动 | Kramdown API 读回；保留 |
| source 类上传 | CLI→实际 Node HTTP→内核 | 通过 | 修改字节产生不同暂存标识，旧 requestId 返回 idempotency_conflict 且零写入 | SHA-256 回读一致；附件已删除 |

## 真实写入覆盖矩阵

以下按当前 ACTION_SAFETY_POLICIES 生成，不把自动化覆盖当作真实 action 验收。已在独立容器覆盖代表性公共路由与下表标记的 mutation action（fs.write 仅覆盖模式），以及两个已授权的文件导出 external action；其余 action 明确排除本轮实测，并非全部 action 验收。纯新增同样领取服务端 requestId。笔记本和文档首次创建为模板修复前的环境搭建验证；模板修复后重新验证模板新增/覆盖/更新/删除、跨入口提交及三类扰动。

| action | 策略 | 真实验收状态 | 原因 |
|---|---|---|---|
| `fs.write` | mutation / state | 部分覆盖 | 覆盖写入报告、预检/提交/重放/读回通过；新增分支未实测；保留报告 |
| `fs.replace` | mutation / manifest | 覆盖 | manifest 扰动拒绝；重新预检提交/重放/读回通过；正文已替换为报告 |
| `fs.rm` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `fs.mv` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `fs.reorder` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.create` | mutation / none | 覆盖（搭建阶段） | 容器测试笔记本创建/重放通过；保留供复用 |
| `notebook.set_open_state` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.remove` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.rename` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.set_conf` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.set_icon` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `notebook.set_permission` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.create` | mutation / none | 覆盖（搭建阶段） | 创建根/子文档，内核预检→CLI/direct 提交→内核重放；子文档已清理 |
| `document.ensure_link_targets` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.create_daily_note` | mutation / none | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.duplicate` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.rename` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.remove` | mutation / state | 覆盖 | 独立子文档预检/CLI 删除/重放/SQL 确认不存在通过 |
| `document.move` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.reorder` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.set_attr` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.heading_to_doc` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `document.doc_to_heading` | mutation / structure | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.insert` | mutation / none | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.prepend` | mutation / none | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.append` | mutation / none | 覆盖 | 父文档追加，预检/提交/重放及结构读取通过；随子文档清理 |
| `block.add_to_daily_note` | mutation / none | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.update` | mutation / state | 覆盖 | CLI/direct/实际 Node HTTP 提交；state 扰动拒绝、重放去重、SQL 读回通过；已清理 |
| `block.replace` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.delete` | mutation / state | 覆盖 | 预检/CLI 删除/内核重放通过；随文档清理验证 |
| `block.move` | mutation / structure | 覆盖 | structure 扰动拒绝；CLI 提交/重放通过；SQL 等索引收敛后验证父节点；已清理 |
| `block.set_fold_state` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.transfer_references` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `block.set_attrs` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.render` | mutation / none | 覆盖 | createIfNotExist 新建 AV 与载体，预检/提交/重放/读回；已清理 |
| `av.add_rows` | mutation / none | 覆盖 | 新增 detached 行，预检/提交/重放/读回；已清理 |
| `av.remove_rows` | mutation / manifest | 覆盖 | 精确本轮 row ID 删除，预检/提交/重放后 render 为空 |
| `av.add_column` | mutation / state | 覆盖 | 新增 text 列，预检/提交/重放/读回；已清理 |
| `av.remove_column` | mutation / state | 覆盖 | 精确本轮 column ID 删除，预检/提交/重放通过 |
| `av.set_cells` | mutation / manifest | 覆盖 | 中文 emoji 写入、旧 manifest 拒绝零写入、新预检提交/重放/读回；已清理 |
| `av.set_column_options` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.duplicate_rows` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.duplicate` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.add_view` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_filters` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_sorts` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_group` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_column_visibility` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_column_order` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_new_item_templates` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.create_from_template` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.configure_two_way_relation` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.configure_rollup` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `av.set_relation` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `file.upload_asset` | mutation / source | 覆盖 | CLI 暂存预检→实际 Node HTTP 提交→CLI/内核重放；修改源文件后原 requestId 拒绝；上传 SHA-256 回读通过；已清理 |
| `file.create_template` | mutation / state | 覆盖 | 修复后重新执行新增与 overwrite，中文/emoji 读回正确、重放去重；已删除 |
| `file.update_template` | mutation / state | 覆盖 | 修复后 CLI 提交 returned committed，前后状态哈希不同；读回正确、重放去重；已删除 |
| `file.delete_template` | mutation / state | 覆盖 | 容器配置显式启用默认关闭 action；CLI 提交/重放通过；两份模板读回均 404 |
| `file.save_doc_as_template` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `file.export_resources` | external | 覆盖（外部副作用） | 用户授权的本地导出补齐；CLI/Node HTTP 保存 ZIP、SHA-256 及 ZIP 内附件验证通过；已清理，不宣称严格写入保证 |
| `file.remove_unused_assets` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `file.rename_asset` | mutation / state | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `file.delete_asset` | mutation / state | 覆盖 | 精确本轮附件路径预检/CLI 提交/重放，资源目录读回确认已删除 |
| `file.extract_doc` | external | 覆盖（外部副作用） | CLI 自动提取 Markdown/附件，原有同级文件保留、重复目标拒绝、validateOnly 不落盘；已清理 |
| `search.find_replace` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `tag.rename` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `tag.remove` | mutation / manifest | 本轮排除 | 未建立该 action 专用夹具；本轮仅验证入口共享、模板和代表性严格写入，不代表功能已实测 |
| `timeline.create_node` | mutation / none | 排除 | 默认排除仓库快照/回滚 |
| `timeline.delete_node` | mutation / state | 排除 | 默认排除仓库快照/回滚 |
| `timeline.rollback_document` | mutation / state | 排除 | 默认排除仓库快照/回滚 |
| `timeline.rollback_block` | mutation / state | 排除 | 默认排除仓库快照/回滚 |
| `system.notify` | external | 排除 | 外部副作用：本次不调用 |
| `system.perform_sync` | external | 排除 | 外部副作用：本次不调用 |
| `flashcard.review_card` | mutation / state | 覆盖 | 真实 App 显示答案/Good 评分、原生 reps 读回、committed、旧状态拒绝和重放均通过 |
| `flashcard.create_card` | mutation / none | 覆盖 | 仅本轮块加入内置卡包；预检/提交/重放/原生 API 读回通过 |
| `flashcard.remove_card` | mutation / state | 覆盖 | 现代 MRTR 拒绝/伪造/参数改变/单次确认/账本重放验证；原生卡包确认目标不存在 |
| `mascot.buy` | mutation / state | 排除 | 默认排除消耗余额 |
| `feedback.submit` | external | 排除 | 外部副作用：本次不调用 |
| extension 动态 action | external | 排除 | 不调用第三方写入；validateOnly 不执行与单次传输已自动化覆盖 |

## 仍有边界

- 内核已支持 2026-07-28 的发现、工具/资源/提示及多轮表单确认，同时保留 legacy；未新增思源 native /mcp 注册，也未修改思源 Go 源。
- legacy 的 confirm=true 是调用方确认约定；现代请求必须使用已签发的单次确认状态。两者均依赖可信客户端收集用户选择，不提供人类批准的密码学证明。
- 内核仍不直接访问调用者的 localFilePath，但本轮已补齐 CLI/Node 的暂存上传与导出自动保存。上传单文件上限 10 MiB；更大文件仍需显式切回 Node 协调器。下载逐文件缓冲，不提供宿主级流式限流或取消。
- 第二批已支持普通只读 action 并发 4 个、独立统计队列和同会话排队取消；运行中 HTTP 调用仍不能由 JS 调度器中断。
- maxResponseBytes 仅限制 JS 解析，Go 宿主仍预缓冲整个响应；未增加原生取消与流式大小限制。
- 协调器是 Sisyphus 入口内的串行边界，不是内核 CAS 或跨进程分布式锁；切换与回滚必须排空并重启，不能迁移活动租约。

## 上传与导出补充验收

第一批交付文件传输功能；第二批并发与取消见后文。当时新版 MCP、交互确认和宿主流式/取消尚未实现；第三批已补齐前两项，宿主两项仍待实现。暂存源由文件名与字节 SHA-256 确定标识，内存只保留不可变内容。TTL 为 10 分钟，最多 64 项、总计 32 MiB、每项 10 MiB；过期项在下一次访问时清理，插件重载全部失效。预检阶段不会调用资源上传 API，账本不保存二进制。响应丢失沿用同一 requestId/owner，不自动重复上传。

- 真实思源仍为上述独立容器 3.8.5；本轮前缀 `TRANSFER-LIVE-1790653562875`。
- 8193 字节中文名二进制附件 SHA-256：`db8e82fcacaeceb336ecb8be90fad31da698c72a6c10fd1ea68a2e5874b78b17`。上传回读、提取出的附件、ZIP 内文件三个路径逐字节摘要一致。
- CLI 使用原 localFilePath 预检，实际 Node HTTP 使用同一路径提交；CLI 与直接内核（uploadSource）重放均 writeAttempted=false。文件改动后再携带原 requestId 提交，返回 idempotency_conflict，未调用资源上传。
- 导出启用 delivery=download，内核不将附件 Base64 塞入响应；CLI/Node 通过自身已配置的认证 API 下载保存。返回逐文件 SHA-256；目标存在时拒绝，原有 keep.txt 未改动。外部导出 validateOnly 返回 preflight_unavailable，输出目录不存在。
- 临时文档 `20260929114604-7lhu4mi` 与附件 `assets/TRANSFER-LIVE-1790653562875-附件-20260929114603-cknnsmn.bin` 已核对所属测试笔记本/前缀后删除。两份内核临时 ZIP、本地独立测试目录也已清理；原报告追加本轮结论。
- 日志：`/tmp/sisyphus-transfer-live-results.jsonl`、`/tmp/sisyphus-transfer-live.log`；夹具与清理标记：`/tmp/sisyphus-transfer-fixtures.json`。自动化日志：`/tmp/transfer-final-tests.log`，构建日志：`/tmp/transfer-build.log`。不包含认证信息。
- 自动化新增覆盖：暂存不可变/去重/过期/容量、非法 Base64/文件名、内核二进制 multipart 与提交去重、客户端传输摘要核对、导出路径穿越、拒绝覆盖、下载失败清理。
- 限制：真实容器尚未等待 10 分钟验证 TTL，该项用可控时钟测试；不做真实 SHA-256 碰撞。下载仍逐文件全量缓冲。直接内核客户端没有本地文件系统，需要自行按清单保存；自动落盘发生在调用 CLI/Node 的机器上。

最终产物复验：`TRANSFER-LIVE-1790653816200` 完整重跑上传、跨入口重放、源文件改变拒绝、提取与 ZIP 校验，全部通过并已清理。最终复验日志为 `/tmp/sisyphus-transfer-live-final.log`；容器 kernel.js 与上表最终 SHA 一致。清理前 SQL 曾因索引延迟未找到新文档，未据此扩大删除范围；待索引可见后核对笔记本和精确 ID，再完成清理。


## 第二批：10 MiB、读取并发、统计队列、排队取消

| 能力 | 实现与验证 |
|---|---|
| 10 MiB 上传 | 上限为 10,485,760 字节，不含 multipart framing；模板 multipart 仍为 8 MiB。CLI/Node 使用二进制暂存，等待上限 120 秒，保留 JSON Base64 兼容入口。自动化验证恰好上限和多一字节拒绝 |
| 读取并发 | 普通只读 action 4 个槽位，修改/外部/extension/App 会话入口独立串行；总在途上限 128，满额不进入工具生命周期。每次执行重新加载独立权限快照 |
| 统计一致性 | analytics、余额增减、展示事件按运行时 client 分组串行；遥测并发检查合并。真实容器 20 个完成请求，totalCalls 与 analytics 明细都精确增加 20 |
| 排队取消 | 同会话、同类型 JSON-RPC ID 才能取消；准备/排队取消不进入协调器、不消费租约。运行中取消保留真实结果，DELETE/过期/淘汰取消待执行任务 |
| 可观测性 | 认证 /health 返回汇总运行/排队/容量，不包含请求内容或 ID |

真实容器中 4 个有限只读 SQL 计算同时处于运行态，第 5 个请求排队；其他会话取消无效，同会话取消返回 request_cancelled、writeAttempted=false。四个计算全部返回 4500001500000；随后 16 个并发版本读取全部正确。最终队列为零。排队修改取消后租约仍可提交、运行中写入不误报取消、队列满额/异常后释放均由自动化用例验证，没有为真实写入注入挂起故障。

真实验收发现并修复两个问题：

1. 10 MiB Base64 暂存在 goja 超过原 30 秒等待；CLI/Node 改用二进制并给暂存独立 120 秒等待。10 MiB 的摘要计算在本容器仍约需 30 秒，属于同一 JS 运行时的同步工作，4 个读取槽位不能消除 CPU 阻塞；本批未提供流式哈希或 native 取消。
2. 原生 goja Buffer 提供 from/concat，但没有 byteLength。analytics 计算长度报错后，旧兜底会把历史覆盖成单条。现在检查方法存在性并回退 TextEncoder；读/追加异常不再尝试覆盖历史。回归覆盖不完整 Buffer 和存储写失败。

10 MiB 真实夹具前缀：`BATCH2-10MIB-1790654941800`。附件摘要 `16400e243e3bfb6c3ec3e4d6312d8cccc59c75ff57e5442003faa517f8356d9c`；CLI 预检 → Node HTTP 提交 → CLI/内核重放、源文件改变拒绝、上传回读、提取附件及 ZIP 内容校验均通过。文档 `20260929121054-s14xgpk`，附件 `assets/BATCH2-10MIB-1790654941800-附件-20260929121000-k6shhfz.bin`，仅位于隔离容器。

证据：`/tmp/batch2-upload-live.log`、`/tmp/batch2-concurrency-live.log`、`/tmp/batch2-all-tests.log`、`/tmp/batch2-final-build.log`。不含认证信息。统计队列只保证同一运行时 client，不提供跨进程锁；Node/CLI 取消通知自动转发、执行中 native HTTP 取消、流式内存上限和现代 MCP 协议仍不在本批范围内。回滚必须先排空修改，再重载并重新预检。

第二批清理与最终复验：已核对测试笔记本、精确文档 ID 和附件前缀，删除上述文档/附件、两份临时 ZIP 和本地夹具；保留报告已追加本批结果并 API 回读确认。最终构建与容器已安装 kernel.js SHA-256 一致；并发/统计/取消在清理后再次验证通过。清理证据 `/tmp/batch2-cleanup.log`。

## 第三批：现代协议、确认与跨阶段回归

第三批插件侧已实现；宿主流式读取和运行中取消未完成。参考 Go 源 `kernel/plugin/api_client.go` 会在返回 JS 前缓冲响应，`plugin.go` 的请求断开也不取消正在执行的 JS 调用。当前没有修改该源码仓库或替换容器内核，不能用 JS 超时包装宣称底层请求已取消。现代客户端因此尚无 HTTP 断连取消；第二批的显式排队取消仍适用于 legacy 会话。

| 检查 | 结果与边界 |
|---|---|
| 现代 SDK 直连 | 2026-07-28 server/discover、tools/list/call、resources/list/read、返回元数据和 structuredContent 验证通过；无 Mcp-Session-Id |
| MRTR 确认 | 真实隔离卡片 remove_card：confirm=true 仍返回 input_required；无签发状态/修改参数/拒绝/状态复用均无写入；接受后 committed；新确认下同业务 requestId 重放去重 |
| AV | 新建载体/数据库、行、列、中文单元格、manifest 扰动拒绝、重新预检提交与重放；删除行列及文档后读回确认 |
| MCP App | 读取三个真实 HTML 资源；用官方 AppBridge 加载 flashcard HTML，实际点击显示答案及 Good。原生 API reps 增加，修复后返回 committed；未验证其他宿主应用的嵌入实现 |
| 商店 / 时间线 | 商店工具与 HTML 只读通过；时间线仅 HTML 资源读取，未调用 /api/repo/*，未购买、同步、通知或反馈 |
| 闪卡安全校验 | 真实旧状态提交返回 state_changed、writeAttempted=false，前后 riffCard 完全相同；新请求提交/重放正常 |
| goja | 最终 kernel.js 在 goja/eventloop 测试桩执行初始化、13 类工具发现、帮助、别名读取、非法预检通过 |
| direct / stdio / CLI | 最终 CJS 均读取到容器版本 3.8.5 |
| 自动化 / 构建 | pnpm test：111 文件、1345 测试通过；pnpm build 与 pnpm build:cli 通过；TypeScript 与原始 HEAD 相比仍 24 条既有诊断，无新增 |

实测修复两处此前遗漏：

1. 内核在 App 结果压缩前未补齐 structuredContent，实际存在的到期卡片被投影为空。现在 Node/内核共享结构化包装，再生成候选列表。
2. 严格复习快照原来仅匹配 cardID 且只取第一页，实际内核使用 riffCardID；导致复习错误标记 no_change、旧状态无法拒绝。新增先失败后通过的分页回归，再以原生 API 复验。快照上限 128 页×512 项，缺失、歧义或不完整快照拒绝预检；新卡动态 due 忽略，已复习卡片 due 保留。

夹具前缀 `BATCH3-1790655676685`，文档 `20260929122117-z2eavwt`、AV `20260929122117-trrhlde`、闪卡块 `20260929122117-z6ww473`。已精确核对笔记本及根文档后清理卡片、行列、文档和本轮 AV 文件；内置卡包与测试笔记本保留。原生 getFile 的缺失响应是 HTTP 202 + JSON code=404，清理验证据此核对，不假定 HTTP 404。

证据：`/tmp/batch3-live-results.jsonl`、`/tmp/batch3-ui-calls.jsonl`、`/tmp/batch3-flashcard-app-verified.jpg`、`/tmp/batch3-all-tests.log`、`/tmp/batch3-final-build.log`、`/tmp/batch3-tsc-final.log`、`/tmp/batch3-goja.log`、`/tmp/batch3-entrypoints.log`。确认绑定/超时/容量和后续分页异常由自动化覆盖，不把这些测试桩算作真实 action 全覆盖。修复前的失败日志保留用于溯源。

跨阶段最终复验：10 MiB 前缀 `BATCH2-10MIB-1790656466771`（复用第二批验收脚本），由最终 CJS + 现代内核共同执行。CLI 预检 → 实际 Node HTTP 提交 → CLI/内核重放通过，源文件改变后的旧请求拒绝，附件 API 回读、extract_doc 和 ZIP 内文件 SHA-256 均为 `16400e243e3bfb6c3ec3e4d6312d8cccc59c75ff57e5442003faa517f8356d9c`。原有输出保留、导出 validateOnly 无落盘。日志 `/tmp/batch3-transfer-final.log`；清理日志 `/tmp/batch3-transfer-cleanup.log`。本轮文档、附件、两份临时 ZIP 和本地临时目录已按精确清单清理。

最终并发回归 `/tmp/batch3-concurrency-final.log`：4 个只读计算同时运行，跨会话取消无效，同会话第 5 个排队读取取消且零写入；20 个完成调用的 stats 与 analytics 均精确增加 20，最终队列清空。此验证在上传与清理结束后单独执行，避免其他测试计数干扰。保留报告通过 CLI 严格预检/提交/重放追加，随后 API 读回；日志 `/tmp/batch3-report.log`。容器和测试笔记本保留供后续宿主改动复用。

## 后续约束：仅修改插件

用户明确要求不修改思源核心代码。本地思源源码仅作为只读参考，不再将宿主改动作为实施前提。下面保留上轮候选方案；本轮实施结果见末节：

- CLI/Node 导出从 readFileBinary/arrayBuffer 改为流式落盘、增量 SHA-256、下载大小/超时限制与中断清理；仅降低调用端缓冲，不能保证思源 getFile 服务端不缓冲。
- 上传保持总量 10 MiB，可增加分片暂存、增量哈希和事件循环让出。最终内核上传仍需完整 multipart；不能宣称全链路常量内存。
- 插件调度增加任务级取消标记，在只读分页和后续请求开始前检查。已发出的单次宿主 fetch 必须等待结束；期间保留实际占用槽位，避免超时释放导致后台请求无限堆积。
- 写操作在进入提交前响应取消；提交开始后保持协调器执行与账本落盘，响应丢失使用原 requestId 核对，不宣称取消或回滚成功。
- 现代直连取消若使用插件任务控制接口，属于需客户端适配的扩展，不能当作已支持标准 HTTP 断连取消。普通现代客户端关闭连接仍无法通知 JS handler。
- 结果预算、分页上限、暂存并发限制及取消后仍在运行的计数可以进一步改善资源控制与可观测性。

只读 Range 探测（独立容器 3.8.5，使用本插件 kernel.js）：POST /api/file/getFile 携带 Range: bytes=0-15 仍返回 HTTP 200，完整 Content-Length=1272069；GET /plugins/.../kernel.js 返回 HTTP 206，Content-Range=bytes 0-15/1272069，实际 16 字节。仅证明该静态插件资源路由支持 Range；不能推断所有资产、导出或工作区文件支持。若使用分段下载，需按目标路由验证 206/Content-Range 和版本一致性，服务端忽略 Range 时拒绝继续分段拼接。

## 纯插件改造实施与最终验收

本轮只改插件仓库；思源源码仓库 git status 仍干净，没有编译或替换容器内核。沿用原本唯一写入协调器，不切换 owner。上方 action 矩阵是各批累计覆盖，不代表本轮再次逐一执行所有 action；本轮新增验证范围如下。

| 能力 | 实现 / 证据 |
|---|---|
| 流式导出 | SiYuanClient.streamFile 消费响应分块；CLI/Node 边写边增量哈希，支持中断、超时、大小限制；拒绝 getFile 的 HTTP 202 错误正文，失败清理本次输出，不覆盖已有文件 |
| 下载预算 | 单个 ZIP / 整次提取最多 512 MiB，每个文件 120 秒；无 Content-Length 也逐块计数。无中途自动重试，避免重复数据 |
| 上传哈希 | kernel HashShim 使用真正增量 SHA-256，不拼接所有输入和整份 padding；64 KiB 批次间让出事件循环。仍保持 10 MiB 上限和完整 multipart，未实现网络分片上传或宿主流式读取 |
| 暂存复用 / 接纳 | /transfer/lookup 只复用已由内核验证、尚未过期的相同文件名+摘要+大小；不得凭声明摘要创建源。完整暂存最多同时 2 个请求，满额 429；存储仍为 64 项/32 MiB/10 分钟 |
| 协作式取消 | 每次工具调用独立 client 代理，在 I/O 前后检查；等待原生读取结束再释放实际槽位。任务控制按认证上下文隔离，现代扩展仅影响配合客户端 |
| 提交保护 | 协调器在 executing 账本写入之前同步设置提交边界；之后拒绝取消，完成业务写入、读回和终态持久化。取消前未写 executing，也不消费合法业务请求；自动化验证原请求仍可提交 |
| CLI / Node 桥接 | 内核委托时 CLI Ctrl-C、Node MCP 入站取消转发 /tasks；不取消业务传输来伪造“未写入”，不自动重发业务请求。自定义控制请求会有限重试接纳竞态 |

最终构建中，现代读取取消被接纳后，真实容器仍占用 1 个 read 槽位，cancelledRunning=1；等待约 1975 ms 后返回 request_cancelled、writeAttempted=false，并移除任务。提交保护实测观察到 committing=true，再取消得到 accepted=false，最终 committed、正文读回正确、原 requestId 重放未写入。专用文档采用 PLUGIN-CANCEL 前缀，按精确 ID 和所属笔记本验证后删除。

10 MiB 最终复验前缀 `BATCH2-10MIB-1790663987253`：CLI 预检→实际 Node HTTP 提交→CLI/直接内核重放全部通过，修改源文件拒绝，上传附件读回、流式提取和 ZIP 内附件摘要均为 `16400e243e3bfb6c3ec3e4d6312d8cccc59c75ff57e5442003faa517f8356d9c`。提取同级文件保留、目标已存在拒绝、validateOnly 不写输出均通过。监测得到 273 个 health 响应，其中 43 次处于暂存期间，最大观察延迟 2794 ms，0 次失败。仍有同步计算开销，不承诺固定响应时延。

中间版本暴露过 60 秒 SDK 超时：增量实现最初逐 SHA block 分配对象，且预检后的提交仍重复暂存。已减少分配并补齐暂存查询复用。超时业务 requestId `c241` 先在原协调器核对为 committed，再用同一 ID 重放验证 writeAttempted=false，没有重新上传；精确清理对应附件。失败证据保留 `/tmp/plugin-only-transfer-live.log` 与 `/tmp/plugin-only-reconcile.log`，不将其算为成功用例。

验证：112 文件、1357 项测试通过；pnpm build / build:cli、goja 冒烟、direct/stdio/CLI 版本读取通过。TypeScript 与原始 HEAD 均 24 条既有诊断，无新增。取消权限隔离、排队/运行槽位、提交边界、SHA 边界与分批一致性、暂存容量/缓存、慢响应超时和下载清理由自动化覆盖；未在真实容器生成 512 MiB 超限文件。

日志：`/tmp/plugin-only-tests.log`、`/tmp/plugin-only-final-build.log`、`/tmp/plugin-only-tsc.log`、`/tmp/plugin-only-cancel-final.log`、`/tmp/plugin-only-commit-final.log`、`/tmp/plugin-only-transfer-final.log`、`/tmp/plugin-only-health-final.log`、`/tmp/plugin-only-goja.log`、`/tmp/plugin-only-entrypoints.log`。没有改动 App HTML，故本轮不重复 UI 评分；前批截图保留。

边界保持：直接现代 HTTP 断开不是任务取消；已发出的思源单次请求不可强制终止；下载流式化只控制客户端；最终 multipart 仍需完整缓冲。回滚需先排空任务再重载、重新预检；旧客户端不发送任务扩展时继续正常工作。

最终清理与并发复验：本轮文档、附件、两份远程 ZIP 及本地临时目录均按精确清单删除；中间超时夹具也已核对账本后清理。4 路读取、跨会话取消隔离及 20 次完成调用的 stats/analytics 增量一致，最终队列归零（`/tmp/plugin-only-cleanup.log`、`/tmp/plugin-only-concurrency.log`）。保留验收文档已追加本轮报告，通过严格预检、提交、同请求重放及 API 正文读回验证。最终容器 kernel.js 与本地构建 SHA-256 相同；API 映射检查、技能检查、git diff --check 通过。

## 插件补齐第四批：SSE、终态恢复与读取预算

只修改插件，思源源码仓库保持干净。最初认为缺少 SSE 接入空间的判断已更正：宿主提供 private.es.handler、port.send/close/onclose；本轮用最终 kernel.js 在 3.8.5 容器验证了真实事件流，不依赖参考源码 3.8.6 的假定行为。

| 范围 | 最终实现与验收 |
|---|---|
| legacy SSE | 标准 GET /mcp + 会话 + 相同认证；连接立即发 tools/list_changed，配置/工具清单每 5 秒检查。真实事件流收到初始和配置变更通知，测试配置 finally 恢复；官方 SDK legacy 模式也收到通知并能重新 listTools |
| 连接限制 | 每认证上下文 4 条、全局 64 条、每连接 10 分钟；重连重新失效工具缓存；无通知历史重放，关闭共享流不取消任务。容量、去重轮询、失效关闭与计时器释放有自动化覆盖 |
| 任务终态 | /tasks v2 支持 result，内存缓存 10 分钟 / 128 项 / 8 MiB 总量 / 单结果 1 MiB。认证绑定、配置/权限变更拒绝披露、超大结果只保留状态、TTL/容量及 taskId 重用拒绝有自动化覆盖；input_required 不缓存终态，SDK 多轮确认回归通过 |
| 真实断线读取 | 只读递归 SQL 执行中断开调用连接，原 taskId 查询到正确完整结果；重复 tools/call 使用该 taskId 被拒绝 |
| CLI 丢响应恢复 | 本轮真实代理在 append 已 committed 后断开响应；最终 cli.cjs 查询一次 /tasks 拿回 committed，业务分发仅一次，原生 API 验证正文只追加一次 |
| 取消 / 提交 | 运行中读取取消后仍占槽约 1885 ms，随后 request_cancelled，终态可查询；提交中取消 accepted=false，最终 committed，缓存可查询，原业务 requestId 重放无写入。带 taskId 的真实危险删除多轮确认成功 |
| 读取预算 | 自有普通只读 action 每次最多 128 次 scoped API I/O、合计 8 MiB 解码内容；超限不返回假成功。真实 SQL 生成 9 MB 文本触发 read_budget_exceeded，队列归零；累计分页/UTF-8/二进制边界、提交后不截断、handler 捕获后仍报告预算错误由自动化验证 |

本轮修改 cli/write-coordinator.ts，前述完整 mutation action 矩阵仍作为覆盖清单：本轮 document.create、block.append、document.remove 实测覆盖；file.upload_asset、file.delete_asset 的最终跨阶段传输回归另记。其余 mutation 本轮 intentionally excluded（无对应业务实现变化，沿用前批已记录结果，不把累计覆盖宣称为本轮全部实测）。timeline、全局清理、第三方外部副作用、同步和购买仍排除。单元测试的 perform_sync 只是 mock，不发送真实同步请求。

夹具 /tmp/kernel-next-commit-fixture.json、/tmp/kernel-next-recovery-fixture.json 均 cleaned=true；恢复夹具 RECOVERY-1790665597603，文档 20260929150638-rxeispc。删除前校验笔记本和精确 hpath。SSE/超限读取测试不创建笔记。

115 文件、1366 测试通过；插件/CLI 生产构建、goja、direct/stdio/CLI 读取通过；tsc 相对上批基线仍为相同 24 条诊断，无新增。最终容器 kernel.js 摘要与表中产物一致。日志：/tmp/kernel-next-tests.log、/tmp/kernel-next-final-build.log、/tmp/kernel-next-tsc.log、/tmp/kernel-next-live-final.log、/tmp/kernel-next-sdk-sse.log、/tmp/kernel-next-recovery-final.log、/tmp/kernel-next-cancel-final.log、/tmp/kernel-next-commit-final.log、/tmp/kernel-next-goja.log、/tmp/kernel-next-entrypoints.log。

边界：终态缓存不是持久化后台任务，重载/过期/淘汰后仍以原写入账本核对；不自动续跑业务写入。现代无会话通知、本地路径直读、上传分片续传、单次原生请求强制取消和宿主流式内存上限未新增；上传仍是 10 MiB。读取预算只约束 scoped client 已解码数据及后续调用，不宣称阻止 Go 预缓冲，也不覆盖 external/App/extension/独立统计路径。回滚前排空提交任务，再重载并重新发现能力和预检。

第四批最终跨阶段回归：10 MiB 前缀 BATCH2-10MIB-1790665619624，附件完整摘要仍为 16400e243e3bfb6c3ec3e4d6312d8cccc59c75ff57e5442003faa517f8356d9c；CLI 预检、源改变拒绝、真实 Node HTTP 提交、CLI/内核重放、提取与两种入口 ZIP 校验均通过。临时文档 20260929150810-qpsk0dc、对应附件、两份 ZIP 和本地目录按精确清单清理。随后单独运行并发测试：4 路读取、跨会话取消隔离、排队取消，20 次完成调用的 stats 与 analytics 均增加 20，最终队列归零。日志 /tmp/kernel-next-transfer-final.log、/tmp/kernel-next-transfer-cleanup.log、/tmp/kernel-next-concurrency.log。最终 health 显示 SSE 连接 0、上传在途 0、读取/修改/排队全部 0。

第四批验收报告已通过最终 CLI 严格预检/提交/原 requestId 重放追加到保留文档，并经 API 正文读回验证；日志 /tmp/kernel-next-report.log。本轮开发 watcher 已停止，保留测试容器和报告。API 映射检查、技能检查及 git diff --check 通过。


## 第五批：仅插件层补齐与优化（2026-09-29）

当前产物摘要见本文顶部；此前各批计数和测试结果作为历史保留。本批共用客户端的读取增强不改变写接口单次提交语义，mutation 清单继续适用；本批真实修改仅执行下表列出的隔离夹具，其余沿用既有自动化及前批证据，不宣称本轮逐 action 全量实测。

| 改进 | 实现 / 验证 |
|---|---|
| 图片 | 普通预算外追加既有单图 20 MiB 额度；9,723,343 字节有效 PNG 在真实容器经 read_image 返回，SHA 与原始数据一致 |
| App / Skills | 两种协议均声明 UI MIME；Skills 使用已有配置关闭声明、SEP 方法与文件资源；真实 goja、SDK 与容器验证 |
| 反馈 / 遥测 | 明确网络适配器调用现有 forwardProxy，Base64 保留正文，禁止自动提交重试/重定向；goja 受控代理验证反馈 GET+POST 与启用后的遥测发送；无真实外部提交 |
| 读取 | 明确只读接口有限重试、退避、取消检查；重试计入次数预算；资源 text/json/arrayBuffer 消费计入字节预算；预算/协作期限可配，失败提供 complete=false 和不跳页的 recovery |
| 分页 | docs_info 新增可选 offset/limit、page.nextOffset；省略分页保持旧结果。容器验证两页读取及结束标记 |
| 模板 | 正文默认 16 MiB、配置范围 1–32 MiB，multipart 另预留 64 KiB；不改附件 10 MiB 限制 |
| Origin | HTTP 与 SSE 统一精确白名单；拒绝通配符、路径和带凭据 URL；容器允许/拒绝验证，不绕过宿主认证/CORS |
| 导出 | Node 与桥接共用独占流式保存器、摘要校验和总量限制；不清空输出根目录，附件失败不伪装成功；自动化覆盖文件保留、失败清理、路径穿越与取消 |
| 编码 | 使用宿主现有原生 Buffer，保留 minimal sandbox fallback；9 MiB UTF-8 编码基准从 6410 ms 降至 10 ms，Native Buffer 对照 9 ms。仅为编码基准，不表示整体写入同比加速 |
| 自动化 / 构建 | 117 文件、1379 测试；插件/CLI/双语文档构建通过；API 与技能检查通过；tsc 24 条诊断与上批归一化后完全一致 |

第一次大模板容器测试发生 SDK 120 秒超时；账本确认 create_template 已 committed，按原状态核对后清理本轮文档、附件和模板，配置恢复。未把超时视为未写入，也未换 requestId 重复创建。该实测促成原生 UTF-8 编码优化；最终产物的后续重跑使用 300 秒测试超时，允许完成大文本严格校验。大模板的 JS SHA-256 计算仍可能较慢。

最终自动化日志 `/tmp/kernel-gap-final-tests.log`，构建 `/tmp/kernel-gap-final-build.log`，文档 `/tmp/kernel-gap-docs-build.log`，类型基线 `/tmp/kernel-gap-final-tsc.log`；goja `/tmp/kernel-gap-goja-final.log`，编码 `/tmp/kernel-gap-encoding-final.log`，三入口 `/tmp/kernel-gap-entrypoints.log`。可复用 goja 脚本 `scripts/kernel-gap-smoke.go` 按宿主启用 URL/Buffer，但所有外部代理请求均由受控测试桩拦截。

剩余边界：原生宿主请求强制中断、Go 响应流式缓冲、直连访问用户电脑文件、独立 TLS/stdio/跨实例路由仍依赖宿主或桥接。超预算不自动进行全量无界读取；文件传输不新增断点续传。回退配置方式见 [高级选项](../zh/reference/kernel-options.md)。

第五批最终大模板容器验收：`/tmp/kernel-gap-live-final.log`。9 MiB 模板预检约 28.9 秒，预检加提交累计约 86.1 秒；之后原 requestId 重放与 API 字节读回均通过。1 秒协作期限对慢 SQL 返回 read_deadline_exceeded、complete=false，等待原生 I/O 返回后释放槽位。文档、9.7 MB PNG、9 MiB 模板均核对精确路径后清理；`/tmp/kernel-gap-fixtures.json` cleaned=true、settingsRestored=true。

第五批 10 MiB 贯穿传输回归已通过 CLI 暂存/预检、源改变拒绝、Node HTTP 提交、CLI 与内核重放、原文件读回 SHA、提取和两份 ZIP 摘要。另用仅当前连接覆盖发现配置的只读测试代理验证 Node 自行执行路径，持久 owner 配置未改变：kernel tools/call 次数为 0，提取 10 MiB 原文件、ZIP 摘要、同级文件保留和已有目标拒绝均通过；日志 `/tmp/kernel-gap-node-export.log`。

第五批最终取消、并发和恢复回归：运行中取消后原生读仍占槽 1442 ms，随后终态 request_cancelled；提交中 accepted=false，随后 committed，结果查询和幂等重放通过。4 路读取、跨会话取消隔离、排队取消、20 次完成调用的 stats/analytics 均 +20；SSE 初始/配置通知、断线只读结果找回、重复 taskId 拒绝、超预算拒绝均通过。日志 `/tmp/kernel-gap-cancel.log`、`/tmp/kernel-gap-commit.log`、`/tmp/kernel-gap-concurrency.log`、`/tmp/kernel-gap-sse-results.log`。

反馈外部真实表单仍未提交；遥测另完成真实容器 forwardProxy → 受控本地 HTTP 接收器的 POST 正文验证，health 显示 sent；原遥测配置 finally 恢复。日志 `/tmp/kernel-gap-proxy-live.log`。实际生产域名、重定向或不同宿主代理限制不在该测试范围。

第一次丢响应恢复测试已证明业务仅分发一次、查询一次、正文仅追加一次，但清理脚本立刻读 SQL 索引时记录尚未可见，导致清理断言失败；索引就绪后按精确 ID/笔记本/hpath 清理成功。测试脚本随后改为最多 3 秒的有界索引等待，再跑整个恢复流程。该问题属于测试夹具清理时序，没有据此修改业务实现或重复原写入。

本批真实 mutation 覆盖：document.create/remove、block.append、file.upload_asset/delete_asset/create_template/delete_template，均有预检、提交、原 ID 重放及读回/精确清理证据。其余 mutation 本批 intentionally excluded：未改变其业务写入实现，沿用前批矩阵及本轮全量自动化，不扩大为本轮逐项实测。timeline 快照、全局资源清理、同步、购买和第三方外部写入仍排除。

第五批最终收尾：带有界索引等待的完整丢响应恢复重跑通过，业务分发 1 次、结果查询 1 次、正文出现 1 次，夹具已清理（`/tmp/kernel-gap-recovery-final.log`）。10 MiB 传输夹具、额外 Node 自执行 ZIP、本地输出均清理；保留报告通过最终 CLI 预检/提交/重放追加，并单独核对第五批标题恰好一次。测试笔记本最终仅保留报告文档，队列/运行中读写/SSE/上传在途均为 0（`/tmp/kernel-gap-final-verify.log`）。安装产物 SHA 与顶部 kernel.js 完全一致；思源参考仓库 git status 为空。开发 watcher 已停止，测试容器保留。

对照表保留全部 143 个静态 action、191 行比较。2026-09-29 再次按源码整理时，将已实现的只读重试独立标 X，强制超时与原生请求中断合并保留 √，并修正 App 声明的过期描述；现为 15 行 √、176 行 X，清单完整性和排序校验通过。概览/action 行有重复映射，不能视为 15 个独立缺陷。5 个静态 action 仍标 √，对应附件上限、超大模板上限及直连文件交付边界；该次整理仅修改文档，没有重新执行上述业务验收。


## 余项补验与超时竞态修复（2026-09-29）

本轮针对第五批尚缺真实环境证据的改动补验，不把此前排除的所有 mutation action 宣称为已逐项实测。复用同一隔离 Docker 3.8.5、测试笔记本和报告。生产产物重新构建，安装到容器的 kernel.js 摘要与本文顶部相同；思源核心未修改。测试脚本保存在 `tests/smoke/`，连接文件只作为运行参数读取，不包含在仓库和日志中。

| 补验项 | 入口 / 夹具 / 结果 | 验证边界 |
|---|---|---|
| 配置上下界 | 原版内核端点读取实际持久配置：请求数 16–512、普通读取 1–64 MiB、期限 1–120 秒、模板 1–32 MiB、重试 0–3 次归一化正确；非法 Origin 被剔除 | 验证配置生效，不代表以最大值进行了压力测试 |
| 真实读取预算 | 同一 SQL 响应在 1 MiB 预算下拒绝、2 MiB 下成功；16 次调用预算拒绝 50 项 docs_info，显式一项分页成功 | 未绕过预算，不自动无界续读 |
| 模板边界 | 1 MiB 正文严格预检、创建、重放、API 读回通过；创建及更新的 +1 字节正文拒绝，原模板摘要保持不变 | 用可配置的 1 MiB 阈值检验准确边界；此前 9 MiB 成功仍为大模板证据，未新增 32 MiB 压测 |
| 附件边界 | 原版内核 `/transfer/upload` 拒绝 10 MiB +1 字节 | 恰好 10 MiB 的完整传输沿用第五批证据 |
| ZIP 下载失败 | 最终 CLI 经真实容器生成 ZIP；本机 HTTP 故障代理分别制造响应体断开、声明大小超过 512 MiB；Node 自执行与桥接均只下载一次、删除部分文件 | 未实际生成 512 MiB 压测文件；流式累计字节超限仍由自动化覆盖 |
| 附件下载失败 | 实际文档导出，在下载其自有附件时注入 HTTP 202 错误信封；两种入口均失败并清理新建子目录，同级 keep 文件保持不变 | 仅对本轮附件注入故障，不影响其他资源 |
| 读取重试 | 临时容器测试插件加载逐字节相同的 kernel.js，宿主边界将版本请求经真实 forwardProxy 转到本地接收器：503/429/断连一次均调用两次；持续 503 共四次；403/无效 JSON/API 错误各一次；readRetries=0 一次 | 属于真实容器中的受控故障注入；附加测试 shim，不冒充未改边界的普通生产调用 |
| 反馈 | 同一临时插件仅重定向固定反馈目的地址，经容器代理完成 GET 元数据、POST 中文正文和响应解包；POST 503 只发送一次 | 未向真实 WPS 反馈服务提交，未认证其生产表单规则；测试插件已停用并移除 |
| 遥测失败 | 原版内核向受控本地 HTTP 接收器 POST，返回 503 后 health 为 failed；第二次工具调用仍成功，冷却阻止再次 POST；配置恢复 | 本次验证失败及冷却，真实生产遥测服务仍未调用 |
| MCP App 协议 | 原版端点协商、三种生产 HTML 资源、App 专用工具可见性、商店启动和只读动作通过；时间线路由仅验证参数拒绝 | 不创建/读取仓库快照、不评分、不购买 |
| MCP App 浏览器 | 真实 Chrome 加载端点返回的生产 HTML，在受控 MCP Host 中完成初始化、商店渲染、点击刷新、调用实际容器 App action 及返回后重绘；无页面异常 | 仅商店的完整浏览器链路；不是 Claude/ChatGPT 等所有真实客户端的兼容性认证，也不是三个 App 所有按钮的全覆盖 |
| Node 响应体停滞 | 最终 CLI 读取测试报告，经代理对 getChildBlocks 只发响应头并保持连接，约 5.3 秒明确报 timeout，只发一次请求 | 与冻结墙钟的确定性单测共同覆盖以下竞态 |

最终全量测试首次运行发现真实竞态：`src/api/client.ts` 的有界响应读取，定时器取消 reader 后只依赖 `Date.now() >= deadline` 判断超时；墙钟未到期限时，`done=true` 会被当成正常 EOF，空正文返回 null。新增冻结墙钟、使用真实定时器的回归用例，旧代码稳定失败；修复为定时器先置 `timedOut` 标记，再取消 reader，读取后同时检查标记和期限。相关 42 项测试通过，全量最终为 1380 项通过。API 审计因源码行号变化一度报文档漂移，重新生成两份映射后全量通过；没有删除或弱化测试。

测试脚本迭代中，时间线调用缺少 scope 导致参数拒绝，已调整为只验证无副作用的非法参数拒绝；临时插件首次因缺少 index.js 未加载，之后发现宿主对象冻结使直接替换 fetch 无效，改为仅在测试插件创建宿主对象副本。最终接收器的实际请求计数验证注入生效。两次收尾断言遇到 SQL 索引尚未收敛，均按精确 ID、所属笔记本和 getHPathByID 重新核验并清理；最终脚本使用真实路径核验和最多 5 秒索引等待，完整重跑通过。这些失败保留为测试环境/脚本证据，不作为业务通过记录。

最终日志：

- `/tmp/kernel-remaining-final-artifact-live.log`：原版容器、最终 CLI 的 14 项检查与精确清理。
- `/tmp/kernel-remaining-final-artifact-faults.log`：最终 kernel.js 在临时插件中的重试和反馈故障注入，外部真实提交为 0。
- `/tmp/kernel-remaining-final-telemetry.log`、`/tmp/kernel-remaining-final-browser.log`、`/tmp/node-stalled-body-live.log`：遥测失败、浏览器动作闭环和最终 CLI 的响应体超时。
- `/tmp/kernel-timeout-regression-before.log`、`/tmp/kernel-timeout-regression-after.log`：确定性复现与修复后回归。
- `/tmp/kernel-remaining-tests-pass.log`、`/tmp/kernel-remaining-build-final.log`、`/tmp/kernel-remaining-tsc.log`：1380 项全量测试、构建和相同 24 项 TypeScript 基线诊断。
- `/tmp/kernel-remaining-final-fixture.json`：complete=true、cleaned=true、配置恢复；前两次清理另有 first/second fixture 记录。报告之外没有保留本轮远端文档、模板、附件或 ZIP；本地仅保留截图/HTML 等验收产物。

可复用脚本：`kernel-remaining-live.cjs`（边界及导出失败）、`kernel-remaining-faults.cjs`（临时插件故障注入）、`kernel-telemetry-failure-live.cjs`（失败冷却）、`kernel-app-browser-live.cjs`（受控浏览器 Host）、`node-stalled-body-live.cjs`（最终 CLI 超时）。不在普通 pnpm test 中自动连接真实实例。

仍未执行：真实客户端完整兼容矩阵、真实外部反馈/遥测服务、同步、购买、第三方写入、时间线快照及全部历史 mutation action 的逐项全量验收；32 MiB 模板和 512 MiB 导出最大负载压力测试也未进行。当前结论为上述改动及故障场景验证通过，不能扩大为所有 action、所有边界和所有客户端均已通过。

本轮最终收尾核验：测试笔记本仅保留原报告，余项补验标题经最终 CLI 预检/追加/原 ID 重放及独立 API 读回确认恰好一次；各次清单中的远端模板、附件和 ZIP 均已不存在，所有临时测试插件已移除。配置恢复，队列/SSE/上传在途均为 0，安装摘要与最终 kernel.js 一致。开发 watcher 已停止。最终全量测试、插件/CLI 构建、文档构建、技能检查、git diff --check 通过；思源参考仓库 git status 为空。
