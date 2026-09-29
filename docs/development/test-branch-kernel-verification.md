# test/comprehensive-coverage 合并后容器验收

日期：2026-09-29。基线为合并提交 `2647d1c`，本轮修复在其工作区中；未修改思源核心。

## 结论与范围

测试分支保留 feature 内核实现及自身新增 action。实测发现并修复 6 项问题，修复后的新增功能 16 组场景全部通过。静态注册表为 15 类、166 个 action；Goja 工具发现为 14 类静态工具，extension 单独动态发现。

本报告不宣称 166 个 action 所有参数组合都已逐项实测。完整 mutation 清单及本轮未覆盖项见文末。真实客户端 App 兼容性、仓库快照/回滚、同步、付费购买和真实外部提交不属于本轮通过结论。

## 发现与修复

| 问题 | 原实测现象 / 日常影响 | 修复与复测 |
|---|---|---|
| 日记路径依赖 Intl | 历史日期的创建、追加、删除在 Goja 报 `Intl is not defined` | 固定英文 Go 日期名称取代 Intl，路径渲染共享给严格预检；创建/获取/追加/前插/读取/列表通过 |
| 日记删除未覆盖目标文档状态 | 实际删除被标为 `no_change`；原预检只读到 notebook 选择器 | 将日期、路径模板、唯一目标与实时正文加入哈希；删除提交/重放/读回通过，预检后插入内容返回 `state_changed` 且不删除 |
| 文档复制检查了源文档 | 副本真实创建，但返回 `no_change` | 按返回的 `copyID` 检查新副本；状态改为 committed，路径回查与幂等重放通过 |
| get_row 漏单选列 | API 中 Status 已为 done，query 可命中，但 get_row 没有该列 | select 从原生 mSelect 成员解码；get_row 按列名/列 ID 均返回值 |
| system.api 依赖 DOM/本地文件 | Goja 报 `document is not defined`，无法列出/描述接口 | API 目录在构建时嵌入，内核 list/describe/GET version 通过；独立 CLI 不携带目录文件也可用 |
| CLI --match 被当作路径 | `system api --list --match version` 返回全部 589 项 | 位置参数解析保留显式 flag 的值，修复后只返回匹配的 3 项；另覆盖 `/api/block` 与裸 describe 路径 |

## 真实运行环境

- Docker：`sisyphus-kernel-live-20260928-201526`，SiYuan `3.8.5`，`127.0.0.1:58602`。
- 既有隔离测试本：`20260929111731-3q6nrjg`。跨入口附件/恢复测试仅操作各自唯一前缀的临时文档。
- 新增功能每轮创建 `TEST-MERGE-<timestamp>` 临时笔记本；结束前验证 ID+名称后删除，所建 AV 文件单独按精确 ID 清理。
- 两个旧 Vitest 实例套件改为各自创建临时笔记本，不再选第一个笔记本或用全局搜索定位可写块；Token 仅从环境加载。
- 内核安装文件与待测 `dist/kernel.js` 的 SHA-256 相等；未修改个人思源实例。

## 构建产物

| 文件 | SHA-256 |
|---|---|
| `dist/kernel.js` | `1c3825c381fbb9347ee880bd8e0b7513554bc9f726ee8ed58f63c16a68faadb9` |
| `dist/mcp-server.cjs` | `64be86d5e843a325629434e46f28f4b663d9cea1a4be946b44fb07e9daf70b93` |
| `cli/dist/cli.cjs` | `511a0376df7cf210bbd775976e41cb4c79b6f0153c38a17ec2160f58f3996150` |

10 MiB 上传/提取/ZIP 跨入口验收使用相同内核、Server 与 CLI `818491c2db21095e3da8f3a79b458d505454524fff81c3a8664451a41945ccb2`。其后 CLI 仅修复 system.api 位置参数映射，最终 CLI 另经独立目录列表/筛选实测和完整自动化回归；不把此前上传记录冒充为新 CLI 哈希的重新上传记录。

## 验证结果

| 检查 | 结果 / 边界 |
|---|---|
| 完整 Vitest（启用真实实例） | 146 文件、1936 项通过，原来跳过的 16 项现在均运行；见下方旧场景评测说明 |
| 新增功能 `test-branch-kernel-live.cjs` | 16 组通过：严格预检、提交、幂等重放与实际读回；日记删除另外验证 stale 拒绝 |
| `kernel-remaining-live.cjs` | 14 项通过：持久配置、读次数/字节预算、1 MiB 模板边界、10 MiB+1 上传拒绝、3 类 App HTML、导出失败/超限清理、配置恢复 |
| direct / stdio / CLI | 本轮构建 CJS 均读到真实版本 3.8.5 |
| SSE / task control | 配置变化通知、断线读取结果恢复、重复 task ID 拒绝、超限读取拒绝、正在执行读取的协作取消通过 |
| 提交后取消 / 丢响应 | 提交窗口取消被拒绝且写入完成；丢弃业务响应后 CLI 只查询结果，业务发送 1 次、恢复查询 1 次、正文只追加 1 次 |
| 10 MiB 附件 | CLI 暂存/预检 → Node HTTP 提交 → CLI/内核重放，源文件改变拒绝；二进制回读/提取/ZIP SHA-256 一致；已有输出保留 |
| 响应体停滞 | 实际 CLI 经故障代理，1 次底层请求，明确 timeout，无空成功/自动重放 |
| 受控重试故障 | 合并原产物验证 429/503/连接失败重试及 403/非法 JSON/API 错误不重试；临时插件及本地接收器已清理。最终产物相同路径另经 Goja 两份脚本验证，不冒充故障容器套件全部重跑 |
| 构建 / schema / Goja | 插件、CLI 构建通过；两份 Goja 脚本通过；自动化检查 schema 和 action 合同 |
| API 映射 / Skills | pnpm api:audit、Skills 一致性及 git diff --check 通过 |
| TypeScript | 48 条既有诊断。与本轮开始的合并分支日志按文件、错误码、消息比较（忽略行号），新增 0，消失 0；不宣称类型检查通过 |

### 旧场景评测的限制

`tests/eval/skill-execution.test.ts` 的 10 个测试仍使用原有成功率阈值，不是每个调用都必须成功。最终报告中 81 个场景调用为 49 成功、3 失败、29 排除/缺少占位夹具。

3 个失败来自示例夹具：上传使用 `/absolute/path/to/image.png`、ZIP 导出引用不存在的 `assets/file.png/file.pdf`、单块替换时前一步 update 已覆盖待匹配的 draft 文本。这些不作为产品功能已失败的证据，也不算成功；上传/ZIP 已由独立 10 MiB 产物验收覆盖。29 项包含未解析的 AV/卡片 ID、缺少图片，以及执行前明确排除的快照/外部副作用。故 `1936 passed` 不能解释成 81 次场景调用全部通过，更不能解释成全 action 验收。

## 可回查证据

- 新增功能脚本：`tests/smoke/test-branch-kernel-live.cjs`；运行方式为 `node tests/smoke/test-branch-kernel-live.cjs <0600 连接状态文件>`。
- 原失败：`/tmp/test-branch-additions-final.log`；新通过：`/tmp/test-branch-additions-verified.log`。
- 结构化新增功能报告：`/var/folders/v0/349jljdn0yq204q4d_gx_4z80000gn/T/sisyphus-test-merge-pSNoJA/report.json`。
- 完整自动化：`/tmp/test-branch-full-live-tests.log`；原场景细分：`/tmp/test-branch-skill-eval/_summary.json`。
- 原有边界补验：`/tmp/test-branch-final-remaining.log`。
- 入口/通知/取消/恢复：`/tmp/test-branch-final-entrypoints.log`、`/tmp/test-branch-final-sse.log`、`/tmp/test-branch-final-cancel.log`、`/tmp/test-branch-final-commit.log`、`/tmp/test-branch-final-recovery.log`。
- 附件/响应体：`/tmp/test-branch-final-transfer.log`、`/tmp/test-branch-final-body.log`。
- 独立 CLI API 目录：`/tmp/test-branch-cli-catalog.log`。
- 初次响应丢失测试成功后，旧清理脚本受 SQL 索引延迟影响；已改用精确文档 ID 的 getHPathByID 确认归属并清理，最终恢复测试清理成功。

## 清理与保留

最终只保留原验收报告和本轮报告文档 `TEST-MERGE-REPORT-1790674441013`（ID `20260929173402-lbqw1l8`），位于隔离笔记本 `20260929111731-3q6nrjg`。临时测试笔记本、文档、AV 定义、10 MiB 附件、远端 ZIP 和本地导出目录均已清理；严格模式保持开启、工具配置恢复、队列及上传在途数均为 0。证据：`/tmp/test-branch-final-cleanup.log`。

本轮修复和测试文件随本记录提交到 `test/comprehensive-coverage`；远程推送状态以 Git 为准。

## mutation action 覆盖矩阵

清单来自当前 `ACTION_SAFETY_POLICIES`（86 项静态 mutation 声明）。covered 仅代表本轮列出的参数/场景；不表示该 action 所有分支全覆盖。日记和 AV 的复合场景细节在新增功能报告中，上传源变化属于 source 类；structure 与其他 manifest 并发扰动本轮沿用自动化与原 feature 证据，未逐项重做容器扰动。

| action | 默认前提 | 本轮覆盖 | 说明 |
|---|---|---|---|
| `fs.write` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `fs.replace` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `fs.rm` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `fs.mv` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `fs.reorder` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.create` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.set_open_state` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.remove` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.rename` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.set_conf` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.set_icon` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `notebook.set_permission` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.append` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.prepend` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.create` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.ensure_link_targets` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.create_daily_note` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.duplicate` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.copy` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.rename` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.remove` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.move` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.reorder` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.set_attr` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.heading_to_doc` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.doc_to_heading` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `document.find_replace` | manifest | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `document.archive` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `block.insert` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.prepend` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.append` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `block.add_to_daily_note` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.update` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.replace` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.delete` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.move` | structure | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.set_fold_state` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.transfer_references` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.set_attrs` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `block.update_task_marker` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `av.render` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.add_rows` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.remove_rows` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.add_column` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.remove_column` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_cells` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_column_options` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.duplicate_rows` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.duplicate` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.add_view` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_filters` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_sorts` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_group` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_column_visibility` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_column_order` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_new_item_templates` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.create_from_template` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.configure_two_way_relation` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.configure_rollup` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.set_relation` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `av.upsert_row` | manifest | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `av.create_table` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `av.update_row` | manifest | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `file.upload_asset` | source | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `file.create_template` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `file.update_template` | state | covered（部分） | 仅超限拒绝和原文件保留；正常更新本轮未逐项重跑。 |
| `file.delete_template` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `file.save_doc_as_template` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `file.remove_unused_assets` | manifest | intentionally excluded | 工作区级清理，未扩大到既有资源集合。 |
| `file.rename_asset` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `file.delete_asset` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `search.find_replace` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `tag.rename` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `tag.remove` | manifest | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `timeline.create_node` | none | intentionally excluded | 快照/回滚或消费余额，不在本轮授权的隔离功能验收范围。 |
| `timeline.delete_node` | state | intentionally excluded | 快照/回滚或消费余额，不在本轮授权的隔离功能验收范围。 |
| `timeline.rollback_document` | state | intentionally excluded | 快照/回滚或消费余额，不在本轮授权的隔离功能验收范围。 |
| `timeline.rollback_block` | state | intentionally excluded | 快照/回滚或消费余额，不在本轮授权的隔离功能验收范围。 |
| `dailynote.create` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `dailynote.append` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `dailynote.prepend` | none | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `dailynote.delete` | state | covered | 本轮真实容器提交、重放及实际状态/内容回查；详见场景表。 |
| `flashcard.review_card` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `flashcard.create_card` | none | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `flashcard.remove_card` | state | intentionally excluded | 本轮未逐项实测；仅有自动化/原 feature 记录，不计入本轮真实通过。 |
| `mascot.buy` | state | intentionally excluded | 快照/回滚或消费余额，不在本轮授权的隔离功能验收范围。 |

`fs.write`、`file.create_template` 的新建/覆盖分支，及 `av.render(createIfNotExist)` 的只读/修改分支须分别理解；上表默认策略不是实际分支覆盖证明。动态 extension、导出、通知、同步、反馈等 external 路径不属于此 mutation 表。
