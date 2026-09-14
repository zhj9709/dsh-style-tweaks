# dsh-style-tweaks

简体中文 | [English](README.en.md)

> 依赖版本：deepseek-harness v0.1.5-rc.1

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web UI 插件：为 DSH 界面提供一套可选的样式调整——精确的对话列宽控制，以及侧边栏与设置面板的一系列小幅度修复。

## 功能

### 布局

- **插件宽度控制**（默认关闭）：开启时插件自带的列宽输入 / 预设接管列宽，并隐藏 DSH 原生的拖拽手柄；关闭（默认）时原生手柄接管列宽，"对话框宽度"设置随之隐藏，已设置的宽度值保留，重新开启即恢复。
- **对话框宽度**：600–1600 px 之间任意值；含 748（默认）/ 880（稍宽）/ 1024（更宽）三个预设按钮。仅在"插件宽度控制"开启时显示。
- **两侧边距**：插件宽度控制开启时，对话区域两侧保留的空白（px），列宽被钳制为对话框宽度，侧边栏打开或窗口缩小时内容会收窄，不会贴住边缘。最低 32 px。仅在"插件宽度控制"开启时显示；关闭后边距不生效，保持 DSH 原生行为。
- **思考内容固定高度**（默认关闭）：展开"深度思考"正文时限制为固定高度（默认 300 px，120–1200 可调），超出部分在窗口内滚动，很长的思考不再把后面的回复顶出视野；思考仍在生成时窗口显示开头，可滚动查看后续。滚轮自然穿透：块内滚到边界或内容不满一块时，滚轮直接滚动会话正文。收起后照旧恢复为一行摘要。右侧配 4px 常显细滚动条（与设置菜单一致），正文与滚动条间留有间距。
- **右侧边栏初始宽度（默认关闭，45%）**：开启后接管右侧边栏首次打开时的宽度——仅在本次页面加载后的第一次打开时按"会话窗口宽度 × 百分比"写入一次（15–70 可选，含 30 / 40 / 45 / 55 四个预设）。之后手动拖拽、关闭再打开都保留你自己拖出的宽度；刷新页面后该百分比重新生效。默认关闭时保持 DSH 自身的 45%，插件完全不介入；开启后默认百分比同样取 45，因此不改数值时观感与原生一致。宿主自身还会把结果钳制到它的范围内（最小 300 px、最大窗口的 70%），换算结果不足 300 px 时按 300 px 显示。0.1.5 之前的宿主上本项保持惰性。

### 调整项

- **表格布局稳定（默认开启）**：锁住 markdown 表格 hover 时的布局，避免周围内容发生回流（"鼠标移到表格上时下方文本会跳动"）。
- **轮次导航栏稳定（默认开启）**：向上滚动到第一条消息上方的系统提示词区域时，让右侧轮次导航栏保持在原位（不再下移约 16 像素）。
- **轮次导航常显（默认关闭）**：DSH 会在聊天列内容盒宽度降到 900 px 时隐藏右侧轮次导航栏（`TurnNavigator.module.css` 中针对聊天滚动区的容器查询）；把右侧边栏拉宽正是触发条件——中间列最多可被压到 400 px，因此右栏在其几乎整个可用区间里都看不到轮次导航。开启后任何聊天宽度下都保留轮次导航；窄宽度下导航停在滚动区右侧的空隙里，悬停预览会遮住部分正文。
- **代码块顶部贴齐（默认开启）**：去掉高亮代码块上方的 16 px 空白，让代码块紧贴在前面的段落、列表项或标题下方。
- **项目目录运行指示（默认开启）**：把与对话标题一致的运行动画圆点放进侧边栏。**项目目录右侧**显示一个，目录收起时也能一眼看出里面有对话正在进行；**会话行的状态槽**也会补一个——会话有后台任务在跑、原生圆点不显示时正好补上（原生自己显示了圆点时本项让位，不重复）。判定"忙"的三个来源：会话正在执行一轮对话、会话有后台任务在跑（`run_in_background` 的 shell 等，从启动一直亮到任务结束）、它下面有子代理在跑。
- **定位当前会话（默认开启）**：在侧边栏"工作区"段头部的搜索按钮左边新增一个定位按钮；点击后自动展开当前会话所属的工作区目录（包括"展开其余 x 个会话"的折叠层），将该会话滚动到侧边栏视口中央。无当前会话时按钮禁用并提示"请先打开一个会话"。
- **设置菜单可滚动（默认开启）**：设置项较多时，让设置面板左侧菜单可以上下滚动，而不是把放不下的项直接裁掉（面板高度固定且 `overflow: hidden`，原生样式只给右侧内容列加了滚动）。滚动条为悬浮式细条：停靠在菜单右侧的留白里、不挤压菜单宽度，只在列表实际滚动时出现，停止滚动约 0.8 秒后淡出。
- **中键关闭侧边栏标签页（默认开启）**：0.1.5 新增的右侧边栏是标签页面板。开启后，鼠标中键点击任一标签页即关闭它（浮动面板的标签页同样适用），与浏览器标签页的习惯一致。关闭走宿主公开的 `ctx.sidebarRight` 关闭接口，原生规则照常生效：唯一驻留的引导页不可关、关闭最后一个停靠标签时侧边栏一并收起，与 ✕ 按钮的行为完全一致；条上的中键自动滚动被抑制，中键按下也不再启动标签拖拽，按住中键移动不会误把标签拖走或浮出。0.1.5 之前的宿主上本项保持惰性。
- **经典统计行（默认关闭）**：DSH 0.1.5 起，输入框下方的统计信息从一行居中文本（轮数/步数 · 耗时 · 速度 · 缓存命中 · Token 用量）改成了两个图标胶囊（点开弹窗查看）。开启本项可恢复 0.1.2 的文本行样式：数据仍读同一批持久化投影（`sessionStats` / `tokenUsage`），数值与胶囊一致，超宽时省略号截断、悬停显示完整内容；关闭后立即恢复新版胶囊。
- **缓存命中两位小数（默认关闭）**：统计信息的缓存命中率按两位小数显示（如 87.35%），不再取整；点开的 Token 用量弹窗同步生效。无论统计信息以新版图标胶囊还是经典文本行展示，均适用；两个开关同时为开时由经典统计行生效。
- **轮次速度与首 token 用时（默认关闭）**：0.1.5 起冷会话不再重建逐 token 时序，每轮"本轮用时和速度"弹窗只剩总用时。开启本项后点击每轮的用时胶囊，弹窗会回填输出速度与首 token 用时两行（由会话日志内嵌的模型流重建，历史会话同样生效）。
- **工作区可关闭（默认关闭）**：把工作区从侧边栏列表与"新建会话"选择器中**隐藏**，而不是删除——宿主的注册记录、会话账目、磁盘文件与会话日志全部保留，工作区 id 与每个会话的账目位置不变；**它名下的会话也一并隐藏**（不会落入"未分组"，搜索里同样不再出现），恢复工作区即整组回来。恢复有两条路：**重新添加同一文件夹**（宿主按规范路径幂等返回原工作区），或在**样式调整设置面板**的"已关闭的工作区"列表中逐项点"恢复"（条目悬停可见其目录路径）。入口在每个工作区行的 `...` 菜单里（排在"删除工作区"之前），点击后有确认框说明数据会保留。三条边界：关闭期间该工作区的手动会话顺序不保留（恢复后按宿主账目序显示）；关闭**你当前所在会话所属的**工作区时，会自动把你交接给一个新会话（落在最近的可见工作区）；选中被关闭工作区内的会话后触发"新建会话"时，会落到最近的**可见**工作区（宿主自身的回退行为）。

```yaml
style-tweaks:
  # 布局
  usePluginWidth: false  # 默认 false；true 时插件输入/预设接管列宽
  dialogWidth: 748       # 600–1600 px；仅 usePluginWidth 开启时显示/生效
  sideMargin: 50         # ≥ 32 px；仅 usePluginWidth 开启时显示/生效
  thinkFixedHeight: false # 默认 false；true 则"深度思考"正文限高滚动
  thinkHeight: 300       # 120–1200 px；仅 thinkFixedHeight 开启时显示/生效
  rightbarInitialWidth: false # 默认 false；true 则由插件按下方百分比接管右栏首开宽度
  rightbarWidthPercent: 45   # 15–70；右侧边栏首次打开时占会话窗口宽度的百分比
  # 调整项
  stableTable: true             # 默认 true；false 则关闭
  stableTurnRail: true          # 默认 true；false 则关闭
  keepTurnRail: false           # 默认 false；true 则任何聊天宽度下都保留轮次导航
  codeBlockFlushTop: true       # 默认 true；false 则关闭
  projectRunningIndicator: true # 默认 true；false 则关闭
  locateCurrentSession: true    # 默认 true；false 则隐藏侧边栏定位按钮
  settingsNavScroll: true       # 默认 true；false 则关闭设置左侧菜单滚动
  sidebarMiddleClickClose: true # 默认 true；false 则关闭侧边栏中键关闭标签页
  legacyStatsLine: false        # 默认 false；true 则用 0.1.2 的文本统计行替换新版胶囊
  pillsCacheHitDecimals: false  # 默认 false；true 则缓存命中率显示两位小数（胶囊与经典行均适用）
  turnSpeedMetrics: false       # 默认 false；true 则用时弹窗回填输出速度与首 token 用时
  workspaceClose: false         # 默认 false；true 则可在侧边栏工作区行菜单中关闭（隐藏）工作区
  closedWorkspaces: []          # 已关闭工作区 id 列表（内部数据，由面板"已关闭的工作区"区块管理）
```

设置入口：**设置 → 样式调整**。

## 安装

```bash
# 方式一：从 npm 安装（推荐，预构建产物）
dsh plugin --profile web add dsh-style-tweaks

# 方式二：从 GitHub 仓库安装（源码，会运行自包含的 prepare 构建）
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks
```

`add` 后面的包说明会**原样转发给 pnpm**，因此可以指定版本——npm 包用 `@版本号`，GitHub 源码用 `#tag`：

```bash
dsh plugin --profile web add dsh-style-tweaks@0.1.3                  # 锁定 npm 版本
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks#v0.1.3  # 锁定 git tag
```

安装完成后**重启一次 `dsh web`**（bundle 插件在进程启动时扫描）。

> 上面假定 `dsh` 已在 PATH 上。没有全局安装时，把每条命令开头的 `dsh` 换成
> `npx -y @deepseek-ai/dsh` 即可（例如 `npx -y @deepseek-ai/dsh plugin --profile web add dsh-style-tweaks`）。

## 开发

### 构建

```bash
pnpm install
pnpm build          # tsc（服务端）+ tsc（客户端）+ 打包 lib/client.js
pnpm typecheck
```

本地加载（覆盖层）或软链安装：

```bash
dsh web --patch ./cordis.patch.yml      # 开发覆盖层
dsh plugin --profile web add "link:./"  # 软链安装（本地开发，见下）
```

### 本地开发（推荐）：`link:` 软链 + 热加载

开发时**不要把仓库打包成 `.tgz` 再装进 profile**，也不需要在每次构建后手动复制文件。用 pnpm 的
`link:` 协议把 profile 里的 `node_modules/dsh-style-tweaks` 直接软链到本仓库，构建产物就落在被
DSH 加载的那个路径上——改完代码不需要复制、不需要重新打包、不需要重装插件。

下文用 `<profile>` 代指 profile 目录：

| 系统 | profile 目录 |
|---|---|
| macOS / Linux | `~/.dsh/profiles/web` |
| Windows | `%USERPROFILE%\.dsh\profiles\web` |

**一次性安装**（在仓库根目录执行，`add` 后面的包说明会原样转发给 pnpm）：

```bash
dsh plugin --profile web add "link:./"
```

这一步会同时写入 profile 的 `dependencies` 与 `dsh.profile.bundles`，并让 pnpm 建好软链；
`link:./` 最终被记成相对路径还是绝对路径取决于 CLI 实现，装完按下面的命令验证一下即可。

> **建软链的前提**：Windows 需要**开发者模式**（设置 → 系统 → 开发者选项）或管理员权限，
> 否则 pnpm 可能建不出符号链接（个别版本会退回 junction，功能上等效）；macOS / Linux 无此限制。

> **只有当你曾手动禁用过这个插件时才需要这一步**：DSH 的树按「`dsh.profile.bundles` →
> `cordis.patch.yml` → `--patch` 覆盖层」依次合成，patch 层最后应用，而 `dsh plugin add/remove`
> 只维护 `dependencies` 与 `dsh.profile.bundles`、不会动这份手写文件。因此 patch 层里若留着
> `disabled: true`，它会活过 remove → add，表现为「装上了、也构建了，但页面什么都不挂」。
>
> 要删的是 **profile 的那份** `<profile>/cordis.patch.yml`，**不是仓库根目录的同名文件**
> （那份是本 bundle 自带的补丁，只有一条 `insert`，不含 `disabled`）。先确认有没有：

```bash
grep -n "style-tweaks" ~/.dsh/profiles/web/cordis.patch.yml                     # macOS / Linux
```

```powershell
Select-String "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Pattern style-tweaks
```

> 只删这一条，其他条目的 disable 保留（那些是刻意的）。

验证软链确实指向本仓库：

**macOS / Linux（含 WSL、Git Bash）**

```bash
link=~/.dsh/profiles/web/node_modules/dsh-style-tweaks
ls -ld "$link"                  # 期望 l 开头，且 -> 指向本仓库
readlink "$link"                # 期望 = 本仓库根目录
test -e "$link/src" && echo "src 可见，确实指到源码"
```

**Windows（PowerShell）**

```powershell
$link = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-style-tweaks"
(Get-Item $link).LinkType   # 期望 SymbolicLink（或 Junction）
(Get-Item $link).Target     # 期望 = 本仓库根目录
Test-Path "$link\src"       # 期望 True，证明确实指到源码
```

**每次改完代码的热加载流程**：

1. **构建**：

   ```bash
   pnpm build
   ```

   这一步不能省。仓库里**没有** `dev` / `watch` 脚本，没有任何东西会替你监听 `src/` 并重新编译；
   改完源码必须手动构建，否则页面加载的仍是旧 bundle（表现为「改了没反应」）。软链下
   `pnpm build` 会原地重写 `lib/client.js`——也就是 DSH 实际加载的那份文件，
   **不再需要任何复制到 profile 的步骤**。

2. **让页面重新加载 bundle**：

   - **先硬刷新 GUI 页面**：Windows / Linux 为 `Ctrl+Shift+R`，macOS 为 `Cmd+Shift+R`
     （或关掉标签页重开）。这是实测最常用、最可靠的一步，绝大多数情况刷新就够了。
   - 只有刷新后依然不生效时，才重启 `dsh web` 进程（停掉再重新运行即可）。

   README 旧版本写的「client-plugin HMR receiver 会检测变更并自动重载」在本地**实测经常不触发**：
   本地 `dsh web` 通常从安装包启动，而不是从源码 checkout 跑 `dev:web`，页面会一直用已经取到的
   那份 bundle。所以「改完刷新前毫无变化」是正常现象，不代表代码没生效。软链只保证**磁盘上的文件
   是新的**，不保证**页面主动重新取**。

**怎么确认新代码真的加载了**：

- 页面里应当存在 `style[data-tweak-css="cst-*"]` 之类的注入样式，以及各调整项留在 `window` 上的
  `__cst_*_cleanup__` 守卫（例如 `__cst_project_running_indicator_cleanup__`）。守卫是 `undefined`
  说明该调整项没挂上。
- 想知道页面拿到的是哪一版 bundle：从 `performance.getEntriesByType('resource')` 里取
  `/plugins/??…dsh-style-tweaks…` 那条的完整 URL，再 `fetch(url, { cache: 'no-store' })`，
  检查里面有没有你刚加进去的标识符。构建后页面**不会**主动重新请求这个 URL，这本身也是判断
  「HMR 有没有生效」的直接手段。
- 若刚好在 DSH 读取 bundle 时覆盖了 `lib/client.js`，可能出现一次「插件整个没挂载」的假象
  （守卫和样式都不在）。刷新一次即可恢复，先别急着怀疑代码。

**边界**：只有客户端产物 `lib/client.js` 能这样热加载。服务端代码
（`src/index.ts` / `src/web.ts` / `src/config.ts` → `lib/index.js`）除了 `pnpm build`，
还必须重启 `dsh web`；涉及 `apps/web` shell 或普通 package 的改动，还要重建对应的 Web 产物并刷新页面。

**回到发布版本**（用包名，不含任何本地路径）：

```bash
dsh plugin --profile web remove dsh-style-tweaks
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks
```

### 备选：打包成 `.tgz` 安装（需要复制产物）

不想让 profile 依赖本仓库路径、或想完整走一遍真实安装流程时，可以把仓库打包成 `.tgz` 再装进 profile。
代价是 profile 里的 `node_modules/dsh-style-tweaks` 变成**一份真实拷贝**（不再指向源码），
因此改完源码必须把构建产物复制过去——也就是 `link:` 方案帮你省掉的那一步。

```bash
pnpm build
pnpm pack            # 产出 dsh-style-tweaks-<版本>.tgz（在 .gitignore 里，不要提交）
dsh plugin --profile web add ./dsh-style-tweaks-0.1.3.tgz
```

装完**重启一次 `dsh web`**（bundle 插件在进程启动时扫描）。

之后每次改代码：

1. **构建**：

   ```bash
   pnpm build
   ```

2. **把产物复制进 profile**（`link:` 方案下不需要这一步）。用「先删后拷」而不是直接覆盖：

   **macOS / Linux**

   ```bash
   dest=~/.dsh/profiles/web/node_modules/dsh-style-tweaks/lib/client.js
   rm -f "$dest" && cp lib/client.js "$dest"
   ```

   **Windows（PowerShell）**

   ```powershell
   $dest = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-style-tweaks\lib\client.js"
   Remove-Item $dest -Force
   Copy-Item lib/client.js $dest
   ```

3. **硬刷新 GUI 页面**；依旧不生效时重启 `dsh web`。

> **为什么不能直接 `cp -f` 覆盖**：pnpm 默认把 `node_modules` 里的文件链接到自己的内容寻址 store，
> Linux / Windows 上用的是**硬链接**，原地覆盖会穿透写回 store，可能污染其他用到同一份文件的项目。
> macOS 的 APFS 默认走 clonefile（写时复制），通常不受影响，但「先删后拷」在所有平台都安全。
> GNU coreutils 下也可以写 `cp --remove-destination`，注意 **macOS 的 BSD `cp` 没有这个选项**。

从 `link:` 切回 `.tgz` 要先 `remove` 再 `add`，因为 profile 里已有一条本地路径依赖：

```bash
dsh plugin --profile web remove dsh-style-tweaks
dsh plugin --profile web add ./dsh-style-tweaks-0.1.3.tgz
```

两个方案的差别只有「产物是否自动落到位」这一条：都要 `pnpm build`，都要刷新页面。
日常改代码用 `link:`，需要验证发布包本身时才用 `.tgz`。

## 工作原理

- **服务端**（`src/index.ts`）：注册 `style-tweaks` 设置命名空间，并挂载同源路由 `/_dsh/style-tweaks/settings`。
- **浏览器端**（`src/client/index.tsx`）：读写该路由、渲染设置页，并根据每个开关的状态实时挂载 / 卸载对应的调整项（纯 CSS 调整项注入运行时 `<style>` 元素；JS 级调整项还会读写应用自身的状态 store 并修补 DOM）。
- **列宽样式引擎**（`src/client/conversation-width.ts`）：写入 `--dsh-chat-user-width` CSS 变量，并在插件接管列宽时隐藏原生 `[data-width-handle]` 拖拽手柄；宽度值同时镜像到原生手柄读取的 localStorage 槽位，开关切换时无缝往返。
- **调整项注册表**（`src/client/tweaks/registry.ts`）：每个调整项的元数据（id、settings 字段名、默认值、i18n 键）集中登记；新增调整项只需在注册表里加一条，并在 `src/client/tweaks/` 下新增一个注入文件。
- **项目目录运行指示**（`src/client/tweaks/project-running-indicator.ts`）：从 `ctx.get('sessions')` / `ctx.get('workspaces')` 读取会话运行状态与目录归属，用 MutationObserver 在侧边栏的两类行上挂载应用自身的 `StateDot`（复用 `@deepseek-ai/dsh-client-ui-primitives` 的同一份模块，动画 keyframes 与样式 token 与对话标题处完全一致）：项目目录头行（`role="treeitem"[aria-expanded]`）右侧，以及会话行（`role="treeitem"` + CSS Modules 局部名 `sessionRow`）原本空着的状态槽里。"忙"的判定合并三个来源：会话自己的 `SessionSummary.running`（正在跑一轮）；会话名下的后台任务——`sessions` store 快照里由 Session Controller 控制流镜像出来的 `jobsBySession`，状态为 `running` / `stopping` 即算（与 DSH 原生会话头部"后台任务"入口 `ui-jobs` 的 `isLive` 同一判据，`run_in_background` 的命令因此从启动亮到结束，不会因为发起它的那一轮已经答完而熄灭）；以及血缘上有子代理在跑（与 `indexSubagentDescendants` 同一条上行遍历）。目录头行按工作区 id 匹配（从 `ProjectRowItem` 的 `props.group.key` 读，与 `GroupNode.key` 一致），不按标题文本——`GroupNode.label` 是目录 basename，两个不同父目录下的同名目录会得到同一个标题（DSH 只拦重名的*重命名*，不拦目录本身重名），按标题匹配会让两个同名目录同时亮，这正是"两个 pi-web 目录都出现运行指示"的原因；会话行只在它那一格**空着**时补点——原生已经渲染了自己的圆点（对话进行中、子代理在跑、等待审批/回答、完成未读）就让位，避免两个点并排。会话行没有可用的插件槽位，DOM 上也不带 session id，因此 id 从 React fiber 链上读（`SessionNodeItem` 的 `props.node.id`）：读取全程防御式，读不到就不处理该行，且每一轮都重新解析，因为侧栏的行会被回收复用。宿主没有 `jobs` 服务时 `jobsBySession` 缺失或为空，自动退回只看原生覆盖的两种情况。
- **定位当前会话**（`src/client/tweaks/locate-current-session.ts`）：在 DSH 侧边栏"工作区"段头部的搜索按钮左边注入一个新按钮。锚点全部走 i18n 与语义片段：通过 `ctx.locale.bind()` 解析当前语言的搜索按钮 aria-label（`workspace` 命名空间的 `search.sessions.aria` 键）与顶部面包屑的 aria-label（`conversation` 命名空间的 `session.hierarchy` 键），locale 服务不可用时退回 `[class*="searchButton"]` / `[class*="crumbs"]` 语义片段兜底。点击后从面包屑（`button[disabled]` 的当前项）读出会话标题，用 `ctx.get('sessions')` 与 `ctx.get('workspaces')` 两个应用级 store 反查所在工作区的 **id**（即使其工作区目录收起也能定位），再按 id 匹配工作区行——id 从 `ProjectRowItem` 的 `props.group.key` 顺着 fiber 链读，不按标题文本，因为两个同名目录的工作区标题完全一样，按标题会展开错的那一个；依次穿透两级折叠——工作区收起时 click 展开、"展开其余 x 个会话"溢出按钮（`[class*="sessionOverflowButton"][aria-expanded="false"]`）挡住目标行时自动点开——然后 `scrollIntoView({ block: 'center' })` 滚动居中。悬停提示复刻了 DSH 原生 `<Tooltip>` 的自研气泡（fixed 定位 + 主题 token + 500ms 延迟 + 视口翻转），而非浏览器原生 `title`。MutationObserver 监听 `aria-selected` / `aria-expanded` 属性变化同步按钮可用性与挂载状态。
- **设置菜单可滚动**（`src/client/tweaks/settings-nav-scroll.ts`）：DSH 设置面板（`SettingsRoot`）高度固定且 `overflow: hidden`，原生样式只让右侧内容列（`.options`）滚动；左侧菜单列表 `.navList` 没有 `min-height: 0` 与 overflow 处理，条目多时被面板直接裁掉。本调整项用"两条 CSS 规则 + 一个小型 JS 驱动"实现：基础规则 `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 12px; margin-inline-end: -12px` 让列表成为滚动容器，并把滚动条"停靠"进导航栏右侧的 12px 留白里（8px 间距 + 4px 条位，恰好占满留白），滑块悬浮在留白上、与菜单项保持 8px 间距；菜单项上限 `max-width: 164px`（DSH 原生 188 导航 − 2×12 padding）钉住原生宽度，无论滚动条出现与否、悬停还是滚动，菜单项都与原生完全同宽；`::-webkit-scrollbar { width: 4px }` 比全局皮肤细两档。显示时机由 JS 驱动：第一版用 `:not(:hover)` 隐藏滑块，但 Chromium 在宿主 `:hover` 变化时不会可靠重绘自定义滚动条伪元素（实测表现为"点击菜单才出现"），因此改为监听列表 `scroll` 事件——滚动时给列表加 `cst-nav-scroll-show` 类显示滑块（颜色沿用面板继承的 l2 主题 token），停止滚动约 0.8 秒后移除类淡出；MutationObserver 在设置弹窗卸载/重开时保持监听器挂在当前列表上。选择器用"弹窗结构 + CSS Modules 语义片段"双保险（DSH 类名按 `[hash]_[local]` 哈希，`navList` 局部名全 DSH 唯一），无需 `!important`。
- **中键关闭侧边栏标签页**（`src/client/tweaks/sidebar-middle-click-close.ts`）：右侧边栏的标签芯片是 `div[role="tab"][data-dockkit-tab="<tabId>"]`，由 `ui-dockkit` 的 `TabPanel` 渲染，而 dockkit 只有右侧边栏（停靠面板与浮动层）采用，因此"芯片"即"侧边栏标签页"。本项在 `document` 捕获阶段挂三个监听（React 17+ 把监听挂在根容器上，document 捕获先于整棵 React 树，拦截因此彻底）：`pointerdown`（中键）拦截传播，芯片自带的按压→拖拽手势无从启动，按住中键移动 ≥4px 也不会再把标签拖走、分屏或浮出；`mousedown`（中键）`preventDefault`，抑制浏览器在标签条上的自动滚动（不影响其后仍会派发的 `auxclick`）；`auxclick`（中键，浏览器对非主键点击只派发 `auxclick`、不派发 `click`）读出芯片上的 `TabId` 交给 `ctx.sidebarRight.close()`——关闭完全走宿主 store 自己的规划规则（缺失标签无事发生、唯一驻留引导页不可关、关闭最后一个停靠标签时侧边栏收起），插件不复制任何一条。`ctx.sidebarRight` 是 0.1.5+ 宿主才提供的服务，且由 `ui-sidebar-right` 在**它自己的插件 fiber** 里 provide——cordis 的属性访问只沿祖先 fiber 链解析，从兄弟插件读会直接抛错（"cannot get property … without inject"），而把它加进本插件的 `inject` 会让服务变成必需、在 0.1.2 宿主上卡死启动；因此该 face 在每次中键关闭时经 `ctx.reflect.get('sidebarRight')` 解析——reflect 实例与 store 为根共享、provide 的隔离键也登记在根，`get` 无需 inject 声明即可跨 fiber 读到兄弟提供的服务，未提供时返回 `undefined` 而非抛错（0.1.2 宿主 → `undefined`，本项保持惰性，仅保留副作用抑制）；`close()` 在无挂载 seat 时抛错，统一吞掉。浮动面板的头部不渲染芯片，其中键关闭转发给头部自带的 ✕ 按钮（`canCloseTab` 不允许时按钮不存在，无事发生），头部的"停靠回面板"按钮被显式排除；按压与释放不在同一芯片上时，浏览器把 `auxclick` 派发到两者的公共祖先，命中不了任何芯片，同样不会关闭。
- **右侧边栏初始宽度**（`src/client/tweaks/rightbar-initial-width.ts`）：右侧边栏的宽度由宿主 `ui-layout` 决定——其 `openRightbar` action 在首次打开时用 `rightbar ??= max(300, round(viewportWidth × 0.45))` 填入 45% 的 px 值（常量 `RIGHTBAR_DEFAULT_RATIO`），拖拽经 `setRightbar` 覆盖（钳制到 `[300, 窗口 × 70%]`），其后关闭 / 再打开都保留该 px；宽度偏好只存在内存 store 里，刷新即回到 `null`。`ctx.layout` 只暴露 `openRightbar(track, fullscreen)` / `closeRightbar()` / `toggleSidebar()` / `selectPanel()`，改宽度的 `setRightbar` 挂在控制器自己的 `panels` 动作集上（TS 层是 `private`，运行时是普通字段）。本项因此包装控制器**实例**的 `openRightbar`：本次页面加载的第一次打开时，先按 `[data-rightbar-col]` 的父元素（宿主测量 `viewportWidth` 的同一个 frame 元素）实测宽度算出 `round(宽 × 百分比)`，经宿主自己的 `panels.setRightbar` 写入，再转发原调用——写入与打开落在同一次 React 提交里，不会先闪一帧 45%；全程不碰 grid 模板与面板 inline 宽度，因此列解算、拖拽手柄位置与面板宽度天然一致。两个页面级标记守住语义：`__cst_rightbar_initial_width_seeded__` 保证每次加载只写一次；`__cst_rightbar_initial_width_dragged__` 由挂在 `[data-side="rightbar"]`（宿主右列拖拽手柄）上的**一次性**探针在首次 `pointerdown` 时置位——用户一旦亲手拖过，本次加载内本项彻底不再写入，否则每次设置变更触发的整体重挂载都会覆盖刚拖出来的宽度。右栏在本项挂载时已打开（用户在设置面板改百分比）则立即按新比例写入，即所见即得的实时预览。宿主未提供 `layout` 服务、或控制器不再携带可调用的 `setRightbar` 时保持惰性；卸载只在当前值仍是自己的包装时才还原宿主方法，不踩其它插件的包装。
- **经典统计行**（`src/client/tweaks/legacy-stats-line.tsx`）：0.1.5 起 DSH 把输入框下方的统计行（旧 `StatsLine`）换成了图标胶囊（新 `StatsPills`），两者挂载方式相同——`conversation.composer.dock` 列表槽位上 id 为 `stats` 的条目。列表槽位的规则是同一 id（同一"格"）里 priority 最低的存活条目渲染，因此本调整项在开关打开时用 `id: 'stats'` + `priority: -2` 影子覆盖原生条目（走槽位系统自己的遮蔽机制，无需 CSS 隐藏或 DOM 修补；它比"缓存命中两位小数"的 `priority: -1` 更优先，见下条），销毁注册即把格子还给原生胶囊；若条目渲染崩溃会自动退位，胶囊原样回来。数据面与新胶囊一致：读 `sessionStats`（整段日志的轮数/步数/耗时）与 `tokenUsage`（计费桶）两个持久化投影，不再做旧版"可见窗口折叠"的兜底（无投影时整行不渲染，符合旧行"无数据不出行"的规则）。文案走插件自己的 `style-tweaks` 命名空间（`legacyStats.*` 键）——旧版 `stats.llm` 系列键在 0.1.5 的词典里已被删除，插件自带中英文案；行样式（居中、三级文字色、省略号截断）按 0.1.2 的 `StatsLine.module.css` 移植，token 全部沿用原值并带兜底。行根元素带 `data-composer-stats` 标记：宿主 InputBar 会围绕任何挂载的统计行把自己的 8px 底距收紧到 4px（`.root:has([data-composer-stats])`），行本身底部补 2px 使总高与胶囊行（26px 行 + 4px 宿主底距）一致——开关切换时对话内容不再上下位移。缓存命中率的小数位数跟随"缓存命中两位小数"开关：开启时按两位小数，关闭时按 0.1.2 原样取整；该开关在挂载时捕获，任何设置变化都会重挂载全部调整项，因此始终即时生效。
- **缓存命中两位小数**（`src/client/tweaks/pills-cache-hit-decimals.tsx`）：新胶囊的命中率取整发生在 dsh-client-ui-chat 模块内部的格式化函数里，插件无法触及，因此本调整项在开关打开时对同一个 `stats` 槽位格做影子替换（`priority: -1`），由插件自绘整行——两个胶囊与点开弹窗按 0.1.5 的 `StatsPills` / `stat-dialog` 逐样式移植（定位与外点关闭直接复用宿主 primitives 的 `useAnchoredPosition` / `useDismissOnOutsidePointer`），缓存命中率改走插件共享的 `formatCacheHitPercent(…, 2)`（按两位小数取整，靠近 100% 时仍按"诚实尾数"多显示一位，如 `99.97`），弹窗各行与胶囊标签同步生效。数据面同样是 `sessionStats` / `tokenUsage` 两个投影（不做窗口折叠兜底）；根元素同样带 `data-composer-stats`。图标方面，胶囊的 gauge 图标在 0.1.3+ 的 primitives 里才存在，故运行时从宿主 primitives 取 `IconGaugeOutline16`，老版本宿主取不到则回退为时钟图标。与"经典统计行"的层叠关系：两项同写一个槽位格，经典统计行注册在 `priority: -2` 优先渲染，本项在其下被遮蔽（不渲染、零开销）；经典统计行关闭后本项若仍为开则自动接管格子，两者都关时恢复原生胶囊。该开关始终显示，不再随经典统计行隐藏：经典统计行同样读取它决定命中率的小数位数。
- **轮次速度与首 token 用时**（`src/client/tweaks/turn-speed-metrics.tsx` + `src/client/tweaks/assistant-stream-timing.ts`）：会话格式 v2（0.1.5）把每次模型尝试的精确时序流嵌进持久化结算（`assistant/message` 的 `data.stream`），但 Chat 界面的冷呈现直接从组装后的消息构建、不回放嵌入流（v2 架构笔记原文："Cold settled presentation therefore does not reconstruct per-token timing"）——轮次尾部的折叠读节点内存 timing，其 `firstTokenTime` 只在 live-chunk 线性折叠中存活，重载后每轮的输出速度（TPS）与首 token 用时（TTFT）全部消失，"本轮用时和速度"弹窗只剩墙钟总用时。本调整项就是该笔记预期的"需要精确证据的消费者"：从会话绑定的公开事件窗口（`ctx.sessions.binding(sessionId).eventSource`，Conversation 组装消费的同一份 feed）读出结算，把 dsh-llm 的紧凑流读取器（`assistantStreamFirstTokenTime`：按 `time0` + `dt` 间隔重建打包 run 内首个 token 的时间）与 0.1.5 `deriveTurnMetrics` 的折叠一并移植——TTFT 取最低 step 的"派发→首 token"延迟，TPS = 携带时序与用量的 step 的 Σ输出 token ÷ Σ解码墙钟。数据全部来自持久化日志，历史会话与刚完成的轮次拿到相同数值。展示选择：弹窗属于 `TurnTimePanel`，无插槽可用，因此本项在 `conversation.chat.assistant-actions` 列表槽（每轮操作行内；list 槽可加性渲染，与其它插件条目无选举冲突）挂一个不可见的控制器——页脚捕获监听只把被点击的页脚转交给一个共享的 body 级 `MutationObserver`（弹窗 portal 到 `<body>`，面板节点无法经 `closest` 找回页脚）；观察器回调是微任务，必然先于下一帧渲染，按 `data-turn-time-details` 稳定标记认领刚提交的弹窗，在“本轮总用时”行后追加 `<dt>/<dd>` 两行：标签直接用宿主词典里仍存活的 `message.turnTime.speed` / `message.turnTime.ttft` / `message.tokensPerSecond` / `duration.seconds` 键，数值行自动继承弹窗自己的 `.details dt/.details dd` 网格样式，与 0.1.2 弹窗逐字一致。追加行会让面板变高，而 `useAnchoredPosition` 的重定位经 `ResizeObserver`→`setState` 延迟到下一帧之后，首帧会先画在偏低 48 px 的旧 `top` 再跳上去（正是“闪一下”）——回填在同一个微任务里按新增高度把固定定位卡片同步上移：弹窗是 `side: 'top'` 挂在胶囊上沿，保持卡片底边不动正是宿主 `place()` 对更高面板算出的同一个值，因此首个绘制帧即最终位置，宿主随后的写入变成同值空操作；只有位移会越过视口顶边（被钳制的极端摆放）才跳过。曾试过“先隐藏卡片、等宿主重定位写入再显示”，它把原本正确的即时打开变成可见的延迟弹出（原本不闪的会话反而开始闪），已弃用；也不要按页脚几何反推位移方向，因为 `data-turn-tail` 是整个轮次的大容器而非操作行；若该轮的线性时序本就存活（原生已渲染速度/TTFT 行），按标签去重跳过。行是注入 React 弹窗内的普通 DOM，随弹窗开合生灭，重开即重注；无数据（流内无 token 或结算不在窗口内）不注入任何行，开关关闭即恢复原生行为。

## 致谢

本插件的灵感来自并参考了 [wlj521/dsh-ui-tweaks](https://github.com/wlj521/dsh-ui-tweaks)——一个更全面的 DSH UI 个性化插件，覆盖字体、表格、时间线、Git 等更多维度。如果本插件的功能不够用，欢迎前往看看。

## 协议

MIT