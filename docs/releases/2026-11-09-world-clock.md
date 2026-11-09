# 北京此刻 · 世界时钟

入口 `/world-clock/`，首页第四张黄色卡片。纯静态应用，不新增依赖和运行时外部请求。

支持北京时间实时对照、2000–2099 日期时间换算、分钟滑块、返回实时、城市搜索/增删与本机记忆、时间表复制及手动复制回退。默认七座城市，最多对照 24 城。全部城市用同一时间戳，偏移按所选日期计算。

## 验证

- 99 项全套 Node 测试通过，包括美国/英国 DST、南半球夏令时、跨年与跨日、半小时/45 分钟时区、无效日期、恶意/空存储。
- 真实 Chromium 浏览器：设备设为洛杉矶仍准确按北京时间显示；实时更新、固定时间不漂移、滑块、城市持久化、键盘 Esc、受限存储、复制回退、已打开页面断网后继续操作均通过。
- 320/390/768/1440 宽度，无整页水平溢出；320px 的 Argentina 长时区搜索结果也无内部横向溢出。页面错误和外部内容请求为零。桌面/手机截图已检查。
- 独立只读整分支审查：无 Critical，一项 Important 为窄屏长搜索标签挤出添加按钮。真实搜索宽度测试先失败再通过，修复 flex 最小宽度和标题换行，重跑完整测试和浏览器验证。

## 取舍与边界

1. 使用设备时钟和浏览器 Intl，没有网络授时。设备时间错误或时区数据库过旧时，结果可能不准确。
2. 默认七座城市可自行更改，最多 24 城；日期限制为 2000–2099，历史或更远的日期不覆盖。
3. 目录包括预置城市及浏览器列举的 IANA 地区时区，不承诺所有 Intl 可接受的别名或 UTC 搜索。
4. 审查未代替实际设备时钟/未来政策校验，仍遵守第 1 项边界；时区更新通过浏览器/操作系统提供。
5. 审查不扩展日期范围，范围外需求仍遵守第 2 项边界。
6. 已验证 Chromium 与四档屏宽，未声明 Safari、Firefox、真实手机或屏幕阅读器完整认证，可能存在未观察到的差异。
7. 发布状态单独按预期 Git 提交的 Pages built、HTTP 200 与公网交互验证确认，不能由本地审查推断。

Deferred minors：无。

依据：[MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)、[IANA Time Zones](https://www.iana.org/time-zones)。

复测：`npm test`；`node scripts/verify-world-clock.mjs`；发布后 `node scripts/verify-world-clock.mjs --base https://serebiisme.github.io`。
