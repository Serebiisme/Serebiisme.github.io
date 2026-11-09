# World Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布以北京时间为基准的城市时钟与时间换算工具。
**Architecture:** 无依赖静态页，时间与偏好逻辑独立模块，页面渲染和事件独立模块；沿用现有站点主题。
**Tech Stack:** HTML, CSS, ES modules, Intl, Node test, existing Playwright.
**Spec:** docs/superpowers/specs/2026-11-09-world-clock-design.md

## Global Constraints

- 路径 /world-clock/；现有 master:/ 来源不改，无外部运行时内容请求。
- 北京时间输入 2000–2099，固定 UTC+08:00；设备时间为准。
- 其他城市由 IANA 标识与 Intl 在同一时刻计算；最多 24 城。
- 保留现有课程及其他应用；不增加依赖。

## Review Focus

- Task 1：DST 前后真实时间跳变、跨年与分数时区。
- Task 1：无效日期、空偏好、未知/重复/恶意存储值。
- Task 2：输入正在编辑时不被实时 tick 覆盖；固定模式不随 tick 走动。
- Task 2：存储/剪贴板受限时仍可操作；键盘和对话框焦点正确。
- Task 2：320/390/768/1440 无水平溢出，无外部请求或页面错误。

### Task 1: 时间与城市逻辑

**Files:** world-clock/clock-core.mjs, world-clock/cities.mjs, tests/world-clock.test.mjs
**Interfaces:** clockAt(epochMs, timeZone) returns time/date/offset/diff/dayDelta/period/minuteOfDay; parseBeijingInput(value) returns epochMs|null; beijingInput(epochMs) returns YYYY-MM-DDTHH:mm; restoreCities(raw,catalog,defaults) returns IDs.
- [ ] 写独立期望的冬夏令、午夜跨年、分数偏移与输入/存储边界测试；运行，预期 RED。
- [ ] 实现上述接口，运行单项与 npm test，预期全绿。

### Task 2: 完整页面与发布

**Files:** world-clock/index.html, world-clock/styles.css, world-clock/app.mjs, index.html, scripts/verify-world-clock.mjs
**Interfaces:** 消费 Task 1 导出；本机键 world-clock:cities:v1；真实 HTML 控件驱动。
- [ ] 增加浏览器核验：冻结时间、选择北京时间、滑块、增删/搜索、刷新保存、空/受限存储、复制回退、键盘、四档宽度；先确认缺页 RED。
- [ ] 实现界面与首页入口，完成浏览器核验并观察截图，预期 GREEN。
- [ ] 独立整体验证审查；修正重要问题并回归。精确检查发布文件，正常提交推送，Pages built/HTTP/公网交互核验后交付。

自检：上述两项覆盖规范；时区与状态接口一致，边界场景有明确测试。按现有会话直接实施偏好执行，常规取舍由实现者记录；不要求用户重复批准已请求的实现与发布。
