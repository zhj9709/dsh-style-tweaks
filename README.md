# dsh-style-tweaks

简体中文 | [English](README.en.md)

> 依赖版本：deepseek-harness v0.1.7-rc.2

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web UI 插件：为 DSH 界面提供一套可选的样式调整——精确的对话列宽控制，以及侧边栏与设置面板的一系列小幅度修复。

## 功能

### 布局

- **插件宽度控制**（默认关闭）：开启时插件自带的列宽输入 / 预设接管列宽，并隐藏 DSH 原生的拖拽手柄；关闭（默认）时原生手柄接管列宽，"对话框宽度"设置随之隐藏，已设置的宽度值保留，重新开启即恢复。
- **对话框宽度**：600–1600 px 之间任意值；含 748（默认）/ 880（稍宽）/ 1024（更宽）三个预设按钮。仅在"插件宽度控制"开启时显示。
- **两侧边距**：插件宽度控制开启时，对话区域两侧保留的空白（px），列宽被钳制为对话框宽度，侧边栏打开或窗口缩小时内容会收窄，不会贴住边缘。最低 32 px。仅在"插件宽度控制"开启时显示；关闭后边距不生效，保持 DSH 原生行为。
- **右侧边栏初始宽度（默认关闭，45%）**：开启后接管右侧边栏首次打开时的宽度——仅在本次页面加载后的第一次打开时按"会话窗口宽度 × 百分比"写入一次（15–70 可选，含 30 / 40 / 45 / 55 四个预设）。之后手动拖拽、关闭再打开都保留你自己拖出的宽度；刷新页面后该百分比重新生效。默认关闭时保持 DSH 自身的 45%，插件完全不介入；开启后默认百分比同样取 45，因此不改数值时观感与原生一致。宿主自身还会把结果钳制到它的范围内（最小 300 px、最大窗口的 70%），换算结果不足 300 px 时按 300 px 显示。0.1.5 之前的宿主上本项保持惰性。

- **Desktop 设置入口外置（默认关闭）**：仅在 Desktop 的“样式调整”设置页显示开关；开启后侧栏底部排列为 `[更多] [设置齿轮]`，点击齿轮复用宿主原有完整 Settings 窗口，“更多”里不再显示重复的“设置”，但反馈、登录、退出等账号操作保留。关闭时恢复原生“更多 → 设置”；Web 版不显示此设置和外置齿轮。该入口依赖当前 Desktop 的账号菜单 DOM 与 portal 菜单结构，宿主结构变化时会安全回退到原生入口。

### 调整项

- **轮次导航常显（默认关闭）**：DSH 会在聊天列内容盒宽度降到 900 px 时隐藏右侧轮次导航栏（`TurnNavigator.module.css` 中针对聊天滚动区的容器查询）；把右侧边栏拉宽正是触发条件——中间列最多可被压到 400 px，因此右栏在其几乎整个可用区间里都看不到轮次导航。开启后任何聊天宽度下都保留轮次导航；窄宽度下导航停在滚动区右侧的空隙里，悬停预览会遮住部分正文。
- **会话标题悬停稳定（默认关闭）**：0.1.6-alpha.2 起，悬停会话行时超宽的标题会平滑滑动到末尾、亮出被省略号裁掉的部分，移开又弹回。开启本项恢复 0.1.6-alpha.2 之前的行为：标题保持原位、始终显示省略号；停顿悬停出现的信息卡片仍会展示完整标题。
- **隐藏会话悬停按钮（默认关闭）**：鼠标移到会话行上时，行尾会浮出「归档」和「置顶」两个图标按钮（归档按钮就在指针下方，一点即归档）。开启本项后它们不再出现，悬停时行尾只保留宿主自己的「…」菜单——两个操作仍在该菜单里，只是不再摆在指针底下。
- **代码块顶部贴齐（默认开启）**：收起高亮代码块**盒内**首行上方的内边距，让第一行代码紧贴卡片的标题栏。只动盒子内部：代码块与前后文本之间的间距、盒内下方与左右内边距、代码与标题栏的对齐，全部与关闭本项时逐像素一致。
- **项目目录运行指示（默认开启）**：把运行动画圆点放进侧边栏。开启期间**全应用**的运行动画圆点都换成 ZCode 那种 8 根短棒的匀速 spinner（1 秒一圈），与系统是否开"减少动态效果"无关——DSH 0.1.7 在开了这一项时会把所有 `StateDot` 冻成静止圆环，所以本项干脆自己画：注入的两个点、对话标题自己的点，一视同仁（详见下文）。**项目目录右侧**显示一个，目录收起时也能一眼看出里面有对话正在进行；**会话行的状态槽**也会补一个——会话有后台任务在跑、原生圆点不显示时正好补上（原生自己显示了圆点时本项让位，不重复）。判定"忙"的三个来源：会话正在执行一轮对话、会话有后台任务在跑（`run_in_background` 的 shell 等，从启动一直亮到任务结束）、它下面有子代理在跑。
- **定位当前会话（默认开启）**：在侧边栏"工作区"段头部的搜索按钮左边新增一个定位按钮；点击后自动展开当前会话所属的工作区目录（包括"展开其余 x 个会话"的折叠层），将该会话滚动到侧边栏视口中央。无当前会话时按钮禁用并提示"请先打开一个会话"。侧边栏收起成图标栏（rail）时该按钮不出现——那时段头部根本没有搜索框。滚动默认一帧到位；在「侧边栏会话列表」里开启「自定义会话显示条数」并打开其中的「展开动画」后才是 280 毫秒缓动（见下条）。
- **设置菜单可滚动（默认开启）**：设置项较多时，让设置面板左侧菜单可以上下滚动，而不是把放不下的项直接裁掉（面板高度固定且 `overflow: hidden`，原生样式只给右侧内容列加了滚动）。滚动条为悬浮式细条：停靠在菜单右侧的留白里、不挤压菜单宽度，只在列表实际滚动时出现，停止滚动约 0.8 秒后淡出。
- **插件面板返回时保持位置（默认开启）**：插件管理面板（左侧导航「插件」打开的那个页面）的两处导航修复，合在一个开关里。其一，**记忆只服务于「返回」**：返回上一层时（组件设置页 → 插件页、插件页 → 插件列表）回到你离开那一页时的滚动位置，而不是跳回顶部；**进入**一个页面不套用记忆、并且从该页顶部开始（实测：列表停在 900 时进入 mnemon 插件页，首帧就在顶部，之后行到齐位置纹丝不动）。定位靠宿主自己写在每个页面根节点上的属性（`data-plugin-detail` / `data-plugin-item-detail` / `data-plugin-row-detail`，列表视图则是那个 `pageHead`），因此不需要猜类名，也不会和别的插件撞。之所以要逐层记而不是只记列表：mnemon 的插件页面本身就够长（16 个组件，滚动区约 2700px 高），从它的组件页返回时丢的就是它自己的位置——同一级的一个 bug。第三级（组件设置页）自己也被记着，但没有任何页面能返回它，所以那份记忆只记不用，换来的是「返回恢复、进入不恢复」这条规则没有例外。三处不显眼但绕不过去的坑：**偏移量没法在切页那一刻读到**（浏览器在布局时就把 `scrollTop` 钳掉了，观察器回调里读到的是 0，实测一个原本在 900 的页面在回调里读作 0），所以改在面板上用捕获阶段的 `click` / `keydown` 记——React 18 把监听挂在根容器上，根的冒泡阶段晚于面板的捕获阶段，因此它们跑在 React 处理函数之前，也就是钳位还没发生的最后一个时刻；**脚本写 `scrollTop` 不派发 `scroll` 事件**（实测写 500 后 400 ms 内零事件），所以 `scroll` 监听只负责滚轮 / 键盘 / 拖滚动条这类真实阅读——也正因为脚本写是静默的，还在进行的重试才能把浏览器那一次钳位和你手上的滚轮分得干干净净（前者带的正是重试已持有的位置，离开原位的那个事件就是你），**Chromium 的滚动锚定会把刚恢复的位置再次拽走**（同一个序列，关掉锚定恢复到 1023，开启时被拖到 1316），因此只在这一个滚动区上关掉 `overflow-anchor`。三层都不会与用户较劲：若某个组件被卸载、页面已比记住的位置更矮，借来的高度按缺的那一段留着、把读者留在原位（代价是内容结束之后空出那一段，直到离开这一页才归还），用户在重试窗口内滚走立刻让位（滚到 77 就停在 77），窗口过后也自由（滚到 90 停在 90）。**记在 0 的页也走同一条「返回」路径**：不把这个 0 写回去，返回就停在切页钳位留下的位置——用自制 `[data-plugin-panel]` 面板实测（600px 滚动区：列表停在 0 → 进入一个 2200px 的页面并滚到 1500 → 返回一个内容只装得下 440 的列表）：旧写法**一次写入都没有**、停在 440（列表底部），现在写一次 0、停在 0。记忆活在**模块作用域**（`detach` 与插件自身的重挂载都不清 `offsets`），因为面板切到聊天时会整个卸载，而本插件的任何一次设置保存都会整体重挂载全部调整项，两者之后发生的返回仍要落在原位；但**重新打开面板本身属于「进入」，不恢复任何位置**；其二是**插件页顶部的标题栏滚动时固定在面板顶端**（`position: sticky; top: 0`，含返回入口、插件图标与「卸载」等操作按钮），背景用面板自己的 `--dsh-alias-bg-base`（面板滚动区透明，其后正是该 token 绘制的，浅色 `#fff` / 深色 `#151517` 实测与面板逐像素一致），返回不必先滚回顶部；标题栏下方补 12 px 空隙的同时配一个 -12 px 负外边距，因此静止时的版面与原生逐像素相同。插件没有插件管理面板（`[data-plugin-panel]` 滚动区）的宿主上本项保持惰性。
- **中键关闭侧边栏标签页（默认开启）**：0.1.5 新增的右侧边栏是标签页面板。开启后，鼠标中键点击任一标签页即关闭它（浮动面板的标签页同样适用），与浏览器标签页的习惯一致。关闭走宿主公开的 `ctx.sidebarRight` 关闭接口，原生规则照常生效：唯一驻留的引导页不可关、关闭最后一个停靠标签时侧边栏一并收起，与 ✕ 按钮的行为完全一致；条上的中键自动滚动被抑制，中键按下也不再启动标签拖拽，按住中键移动不会误把标签拖走或浮出。0.1.5 之前的宿主上本项保持惰性。
- **经典统计行（默认关闭）**：DSH 0.1.5 起，输入框下方的统计信息从一行居中文本（轮数/步数 · 耗时 · 速度 · 缓存命中 · Token 用量）改成了两个图标胶囊（点开弹窗查看）。开启本项可恢复 0.1.2 的文本行样式：数据仍读同一批持久化投影（`sessionStats` / `tokenUsage`），数值与胶囊一致，超宽时省略号截断、悬停显示完整内容；关闭后立即恢复新版胶囊。
- **缓存命中两位小数（默认关闭）**：统计信息的缓存命中率按两位小数显示（如 87.35%），不再取整；点开的 Token 用量弹窗同步生效。无论统计信息以新版图标胶囊还是经典文本行展示，均适用；两个开关同时为开时由经典统计行生效。
- **本轮用时和速度（默认关闭）**：0.1.6 及之前，一轮结束后的行尾有两个可点开的读数——用量和用时，各自点开一个弹窗；0.1.7-alpha.1 的"性能与用量"偏好提交去掉了用时那一个（`TurnTimePanel`、`message.ranFor` 与整组 `message.turnTime.*` 文案一并消失）。开启本项把它加回用量右边（顺序回到 0.1.6 的「用量 → 用时 → 时间戳」），连同「本轮用时和速度」弹窗：本轮总用时，以及输出速度（TPS）与首 token 用时（TTFT）两行——后两项由会话日志内嵌的模型流重建（0.1.5 起冷会话不再回放该流，本项就是补回这两个数字的那一步）。两项数字都来自持久化日志：用时按 `turn/start` → `turn/end` 折算，历史会话同样显示；载入窗口里没有该轮起止事件时不显示这个读数，保持 0.1.7 原样。
- **过程组显示调用次数（默认开启）**：一轮的思考与工具调用在对话里合并成一个可折叠的过程组，0.1.6 及之前它的标题是一行计数——工具调用次数与消息条数（起了子代理时还带 subagent 数）；0.1.7-alpha.1 把标题换成了用时（生成中 / 失败 / 停止时是各自的状态文案）。本项把 0.1.6 的计数接在用时后面，两半同时显示：计数随轮次进行实时增长（多一次工具调用、多一条消息都会立刻反映），失败 / 停止 / 生成中的标题同样适用；没有可计数内容的轮次保持原样。需要恢复 0.1.7 原样时可显式关闭。
- **过程内容上方显示用时（默认关闭）**：0.1.7-rc.2 及之前，轮次一开始渲染就有过程组标题，而且那个标题是禁用状态的（运行中的轮次永远展开），所以它只是标题行而非控件——`深度求索中，用时 1小时50分26秒`，放在工具行正上方，每秒刷新，没有折叠箭头。0.2.0-rc.1 不再在生成途中画它，把运行标签移到了对话流末尾那条蓝色行上，工具输出再多也不会把它推离输入框。开启本项把 0.1.7 的标题补回该轮次工具行的上方（同时开启上一项时还带上 0.1.6 的计数），并按本项自己的字典计时（0.2.0-rc.2 改掉了时长文案模板，原样借用只会打印出键名）。它不可点击、没有箭头，是一条 `div` 而不是宿主的按钮。**标题随该轮次的第一行内容一起出现，而不是随轮次本身**：第一行内容落地之前下方还没有它要统领的东西，而且蓝色行本来就在说"正在生成"——那段时间屏幕与关闭本项时完全一致。末尾那条蓝色行自始至终按 0.2.0 的样子显示，本项不隐藏也不改动它，因此开启后两行并存。轮次结束后只剩宿主自己的标题。
- **统计弹窗不透明（默认关闭）**：0.1.7-alpha.1 把卡片材质换成了半透明 + 背景模糊（共用的 `--dsw-specific-menu` 填充从 0.1.6 的不透明 layer-3 变成半透明色，并配上 40px 背景模糊），半透明卡片上的数字读起来更费劲。开启本项**只**把这五张从胶囊点开的读数弹窗换回 0.1.6 的不透明背景：行尾的用量与用时、输入框下方的会话统计与 token 用量、上下文占用按钮点开的面板。其余表面（会话 / 工作区「…」菜单、模型选择、输入框的 / 与 @ 菜单、任务 / 队列 / dock 面板）刻意保持 0.1.7 的磨砂材质不动；深色主题沿用主题自己的 layer-3，无需另设。
- **上下文占用按钮不显示悬停信息（默认关闭）**：0.1.6-alpha.2 起输入框底部新增了上下文占用按钮（圆环 + 百分比），鼠标移上去会浮出"上下文已用 N%"的悬停提示。开启本项后该悬停提示不再显示；按钮自身的悬停高亮与点开的明细弹窗不受影响，完整数字仍可一键查看。没有该按钮的宿主上本项保持惰性。
- **工作区可关闭（默认关闭）**：把工作区从侧边栏列表与"新建会话"选择器中**隐藏**，而不是删除——宿主的注册记录、会话账目、磁盘文件与会话日志全部保留，工作区 id 与每个会话的账目位置不变；**它名下的会话也一并隐藏**（不会落入"未分组"，搜索里同样不再出现），恢复工作区即整组回来。恢复有两条路：**重新添加同一文件夹**（宿主按规范路径幂等返回原工作区），或在**样式调整设置面板**的"已关闭的工作区"列表中逐项点"恢复"（条目悬停可见其目录路径）。入口在每个工作区行的 `...` 菜单里（排在"删除工作区"之前），点击后有确认框说明数据会保留。三条边界：关闭期间该工作区的手动会话顺序不保留（恢复后按宿主账目序显示）；关闭**你当前所在会话所属的**工作区时，会自动把你交接给一个新会话（落在最近的可见工作区）；选中被关闭工作区内的会话后触发"新建会话"时，会落到最近的**可见**工作区（宿主自身的回退行为）。

- **自定义历史分页大小（默认关闭）**：DSH 原生会自行决定历史请求的条数（当前 0.1.7 的冷打开与「加载更早」为 500，轮次跳转另有至少 200 条的窗口下限）。开启后，每次适用请求都**精确使用**设定条数（50–1000，默认 500），无论比原生值大还是小；改写发生在浏览器发出的请求上——「加载更早」与轮次跳转共用的 unary `session/page`，以及可选的打开会话首屏 `session/follow` 开帧。插件还会把宿主的轮次窗口最小值同步为同一个条数，避免大页数仍因原生 50 条下限只加载两轮。三条边界：**条数精确生效**，不再只是「只升不降」的下限；**首屏由「打开会话时同样生效」（默认开启）单独控制**，关掉它则首屏保持 DSH 原生行为、条数只影响后续分页；**关闭主开关即完全回到 DSH 原生行为**，已保存的条数保留，重新开启时沿用。

- **自定义侧边栏会话条数（默认关闭）**：DSH 原生把每个工作区的会话列表折叠成 5 条，点一次「展开其余」再增加 5 条；这两个值都是宿主工作区浏览器组件内部的 `useState`（`COLLAPSED_SESSION_LIMIT`），持久化的视图 store 里没有对应的键，外部设置、插槽与 store 动作都够不到。开启后由插件接管：工作区静止时显示「初始显示条数」条，每次展开增加「每次展开增加条数」条（两者都以宿主的 5 为下限、不设上限，加减号每次点击变化 1）。实现不是替换宿主控件，而是驱动它已经渲染的那个按钮：插件按宿主的溢出按钮把列表撑到需要的条数，把多出来的行用自己的标记属性隐藏，再用自己的按钮顶替宿主按钮的位置——文案沿用宿主自己的 `workspace` 命名空间措辞（`sessions.expand` / `sessions.collapse`），数字是诚实的剩余条数，全部展开后按钮变为宿主的「收起」，点它裁剪回初始条数（宿主的折叠只能表达 5 条，所以收起由插件自己完成）。三条边界：**不隐藏当前选中的会话行、也不让它错位**（打开会话——包括通过宿主搜索打开、或用「定位当前会话」找到——会把该行标成 `aria-selected="true"`；裁剪只砍它下方的行，它上方一律保持可见，所以该会话在列表里的屏幕位次就是它真实的位次；由此抬高的可见条数会**取整到配置尺寸（初始 + 整数倍的步长）并记在该组上**——所以选中第 9 条时列表显示 14 条而不是 9 条，之后再点列表中更靠前的会话也不会缩回去；折叠工作区会**重置你按「展开其余」堆出来的那部分**（折回来是紧凑的），但**当前选中行要求的尺寸会保留**：展开时按它把列表重新撑开，否则选中行不在渲染窗口里、这个尺寸就再也量不回来了；**改本区块的设置不会动已经在屏幕上的列表**——保存任何一项都只是重新挂载插件，已展开的工作区保持原宽度，新条数立刻作用于没被展开过的列表，其余列表在下次折叠后按新值）；**展开过程从不隐藏列表**（宿主自己的行滑入动画把 5→10→15 的几步呈现为一次生长，插件不再叠加 `visibility` 之类的隐藏，短到一帧的隐藏同样会被读成闪烁）；**静止时零开销**（每组按指纹比对，状态未动就跳过该组的整轮扫描，侧栏因其它原因频繁更新时也不会反复重算）。同一区块里还有「展开动画」（默认关闭）：开启后被揭示的行在 160 毫秒内淡入并撑开高度（隐藏方向始终瞬时），定位按钮的滚动也走 280 毫秒缓动；默认关闭则两者都是一帧到位。它是给**「减弱动态效果」**机器（宿主自己的行淡入与浏览器的平滑滚动在那里双双失效，揭示与滚动会叠成一次瞬移）准备的可选做法——要不要平滑是偏好，所以默认不做；定位按钮的滚动也跟随这个开关，但两者都只在**同区块的总开关（自定义会话显示条数）开启时**生效：总开关关闭时侧边栏回到 DSH 原样、定位滚动同样一帧到位（取值保留，重新开启时按你的选择恢复）。关闭（默认）即完全回到 DSH 原生的折叠条数与原生按钮（展开记忆也一并清掉，重新开启时按配置条数开始）；宿主没有这些结构锚点时本项保持惰性。

> 字段与默认值参考（设置面板自动维护）。**DSH 0.1.7+ 的实际存储是 `<profile>/.dsh-style-tweaks/store.json` 的 `value` 对象**——字段名与下表一致（JSON），可直接手改、**下次读取（刷新/重开设置面板）即生效**；`cordis.patch.yml` 里本插件那行 `config` 已不再被读取，仅作 store 文件缺失时的播种源（删掉 store 文件即可让它重新播种；本机 profile 里那一行通常已经没有 `config` 块，属正常——store 存在时它不参与任何读写）。更早的宿主存于 settings namespace。对于 partial store，未写入的字段按当前默认值解析；因此旧的 Desktop/Web profile 若没有 `turnProcessCounts` 也会默认显示计数，若要关闭请显式写入 `false`。

```yaml
style-tweaks:
  # 布局
  usePluginWidth: false  # 默认 false；true 时插件输入/预设接管列宽
  dialogWidth: 748       # 600–1600 px；仅 usePluginWidth 开启时显示/生效
  sideMargin: 50         # ≥ 32 px；仅 usePluginWidth 开启时显示/生效
  rightbarInitialWidth: false # 默认 false；true 则由插件按下方百分比接管右栏首开宽度
  rightbarWidthPercent: 45   # 15–70；右侧边栏首次打开时占会话窗口宽度的百分比
  desktopSettingsLauncher: false # 默认 false；仅 Desktop 设置页显示；true 时显示 [更多] [设置齿轮]
  # 历史加载
  historyPageSizeEnabled: false # 默认 false；true 则每次历史请求按下方条数携带（面板中的主开关）
  historyPageSize: 500          # 50–1000；仅 historyPageSizeEnabled 开启时显示/生效
  historyPageSizeColdStart: true # 默认 true；打开会话首屏也按该条数
  # 侧边栏会话列表
  sidebarSessionCountEnabled: false # 默认 false；true 则由下方条数接管每个工作区的会话列表折叠
  sidebarSessionInitialCount: 5     # ≥ 5；工作区静止时显示的会话条数（仅 sidebarSessionCountEnabled 开启时显示/生效）
  sidebarSessionExpandStep: 5       # ≥ 5；点一次「展开其余」增加的条数（同上）
  sidebarSessionExpandAnimation: false # 默认 false（揭示与定位滚动都一帧到位）；true 则揭示缓入 160ms、定位滚动 280ms（仅在总开关开启时显示并生效：总开关关闭时两者都是一帧到位，取值保留）
  # 调整项
  stableSessionTitle: false     # 默认 false；true 则会话标题悬停时不滑动、保留省略号
  hideSessionHoverActions: false # 默认 false；true 则悬停会话行时不浮出「归档」「置顶」按钮（只留「…」菜单）
  keepTurnRail: false           # 默认 false；true 则任何聊天宽度下都保留轮次导航
  codeBlockFlushTop: true       # 默认 true；false 则关闭
  projectRunningIndicator: true # 默认 true；false 则关闭
  locateCurrentSession: true    # 默认 true；false 则隐藏侧边栏定位按钮
  settingsNavScroll: true       # 默认 true；false 则关闭设置左侧菜单滚动
  pluginPanelScroll: true       # 默认 true；false 则插件面板各层都不记住滚动位置、插件页标题栏也不固定
  sidebarMiddleClickClose: true # 默认 true；false 则关闭侧边栏中键关闭标签页
  legacyStatsLine: false        # 默认 false；true 则用 0.1.2 的文本统计行替换新版胶囊
  pillsCacheHitDecimals: false  # 默认 false；true 则缓存命中率显示两位小数（胶囊与经典行均适用）
  turnTimePill: false           # 默认 false；true 则把 0.1.7 去掉的用时读数加回用量右边（含"本轮用时和速度"弹窗：总用时、输出速度、首 token 用时）
  turnProcessCounts: true       # 默认 true；false 则不把 0.1.6 的调用次数接在折叠过程组的用时后面
  legacyRunningHeader: false    # 默认 false；true 则给运行中的轮次补回 0.1.7 的过程组标题行（随第一行内容出现，末尾蓝线不动）
  opaqueStatDialogs: false      # 默认 false；true 则五张统计弹窗用回 0.1.6 的不透明背景（菜单与各类面板保持 0.1.7 的磨砂）
  legacyContextMeter: false     # 默认 false；true 则上下文圆环回到输入框工具行内（0.1.6-alpha.2+）
  contextPillNoTooltip: false   # 默认 false；true 则上下文占用按钮不再浮出悬停提示（0.1.6-alpha.2+；开启上一项时本行在面板中隐藏，值仍生效）
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
dsh plugin --profile web add dsh-style-tweaks@0.1.6                  # 锁定 npm 版本
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks#v0.1.6  # 锁定 git tag
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
dsh plugin --profile web add ./dsh-style-tweaks-0.1.6.tgz
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
dsh plugin --profile web add ./dsh-style-tweaks-0.1.6.tgz
```

两个方案的差别只有「产物是否自动落到位」这一条：都要 `pnpm build`，都要刷新页面。
日常改代码用 `link:`，需要验证发布包本身时才用 `.tgz`。

## 工作原理

- **服务端**（`src/index.ts` / `src/store.ts`）：声明 `style-tweaks` 设置命名空间，并挂载同源路由 `/_dsh/style-tweaks/settings`。DSH 0.1.7 起命名空间就是本插件 entry 自己的 Config（entry id 即命名空间，字段带 `.volatile()` 标记），但**取值读写走插件自有存储 `<profile>/.dsh-style-tweaks/store.json`**——路由每请求现读现写 + revision CAS，绕开宿主 settings 全管线（该管线一次写实测 905–1114ms，自有存储 ~10ms；见 `.docs/PLAN-DIAGNOSIS-index.md`），store 缺失时首次请求从 entry Config 的显式字段播种一次；更早的宿主走 `ctx.settings.register` + 原 settings 路径，命名空间仍是同一个。
- **浏览器端**（`src/client/index.tsx`）：读写该路由、渲染设置页，并根据每个开关的状态实时挂载 / 卸载对应的调整项（纯 CSS 调整项注入运行时 `<style>` 元素；JS 级调整项还会读写应用自身的状态 store 并修补 DOM）。
- **Desktop 设置入口**（`src/client/tweaks/desktop-settings-launcher.ts`）：仅在 Desktop renderer 中、且 `desktopSettingsLauncher` 开关开启时观察侧栏账号菜单，把设置齿轮插入“更多”所在的 trigger row 右侧，形成 `[更多] [设置齿轮]`。齿轮尺寸不是写死的：它实测“更多”按钮高度后**完全等高**（展开态 44px），沿用宿主原有的居中对齐，不加额外高度也不加负外边距。这样 hover 时两个按钮的背景块高度一致，宿主按钮尺寸变化时齿轮也自动跟随。点击齿轮通过一次性的 portal 菜单 DOM 桥接激活宿主原生 Settings 动作，复用完整设置窗口；“更多”中的原生设置项被隐藏，反馈、登录、退出等操作保留。开关默认关闭，关闭时恢复原生“更多 → 设置”；Web renderer 不显示该开关也不挂载入口。实现依赖账号菜单的语义角色、菜单定位和 CSS Modules 局部类名片段，结构失配时回退到原生菜单。
- **列宽样式引擎**（`src/client/conversation-width.ts`）：写入 `--dsh-chat-user-width` CSS 变量，并在插件接管列宽时隐藏原生 `[data-width-handle]` 拖拽手柄；宽度值同时镜像到原生手柄读取的 localStorage 槽位，开关切换时无缝往返。
- **调整项注册表**（`src/client/tweaks/registry.ts`）：每个调整项的元数据（id、settings 字段名、默认值、i18n 键）集中登记；新增调整项只需在注册表里加一条，并在 `src/client/tweaks/` 下新增一个注入文件。
- **项目目录运行指示**（`src/client/tweaks/project-running-indicator.ts`）：从 `ctx.get('sessions')` / `ctx.get('workspaces')` 读取会话运行状态与目录归属，用 MutationObserver 在侧边栏的两类行上挂载应用自身的 `StateDot`（复用 `@deepseek-ai/dsh-client-ui-primitives` 的同一份模块挂载，但 ongoing 这个状态的外观被本项整体改掉了。宿主自己的 ongoing 是一个"呼吸弧线圆环"，而且 0.1.7 起在 `prefers-reduced-motion: reduce` 下会被直接冻成静止圆环——系统开了这一项时**所有**运行动画圆点，对话标题自己的点也在内，全都停住。静止的圆环说不出"有活在跑"，所以本项把全应用的 ongoing 圆点都重画成 ZCode 那种 spinner：lucide 的 `loader` 图标，24 视口里半径 6→10、约 2 单位粗、圆头，8 根等长等粗、**没有**透明度渐变，按 `animate-spin` 的 1 秒一圈匀速转，与系统设置无关。CSS 只能碰到宿主的 `svg` / `g` / 两个 `circle`，所以短棒是把 lucide 那份 `loader` 的路径数据原样做成一个 `data:` URI 的 SVG 遮罩，贴在 `svg` 元素上（`mask-size: 100% 100%`，任何尺寸的 StateDot 都成立），`svg` 自己填 `currentColor`，因此颜色仍由宿主的 CSS Modules 决定（tertiary 灰）；宿主在 `svg` 里画的东西整个关掉（`> *`，不是只点名今天这两个 `circle`，宿主哪天换成别的元素也照样盖住）。用遮罩而不是用 `conic-gradient` 画扇形，是因为渐变画出来的楔形会随角度出现抗锯齿差异、看起来深浅不一，而 SVG 描边（圆头）的光栅化与 ZCode 自己渲染这个图标时完全一致。作用范围只到这个圆点组件——宿主其它按"减少动态效果"关掉的动效（工具行扫光、文字 shimmer、进度条等）不受影响）：项目目录头行（`role="treeitem"[aria-expanded]`）右侧，以及会话行（`role="treeitem"` + CSS Modules 局部名 `sessionRow`）原本空着的状态槽里。"忙"的判定合并三个来源：会话自己的 `SessionSummary.running`（正在跑一轮）；会话名下的后台任务——`sessions` store 快照里由 Session Controller 控制流镜像出来的 `jobsBySession`，状态为 `running` / `stopping` 即算（与 DSH 原生会话头部"后台任务"入口 `ui-jobs` 的 `isLive` 同一判据，`run_in_background` 的命令因此从启动亮到结束，不会因为发起它的那一轮已经答完而熄灭）；以及血缘上有子代理在跑（与 `indexSubagentDescendants` 同一条上行遍历）。目录头行按工作区 id 匹配（从 `ProjectRowItem` 的 `props.group.key` 读，与 `GroupNode.key` 一致），不按标题文本——`GroupNode.label` 是目录 basename，两个不同父目录下的同名目录会得到同一个标题（DSH 只拦重名的*重命名*，不拦目录本身重名），按标题匹配会让两个同名目录同时亮，这正是"两个 pi-web 目录都出现运行指示"的原因；会话行只在它那一格**空着**时补点——原生已经渲染了自己的圆点（对话进行中、子代理在跑、等待审批/回答、完成未读）就让位，避免两个点并排。会话行没有可用的插件槽位，DOM 上也不带 session id，因此 id 从 React fiber 链上读（`SessionNodeItem` 的 `props.node.id`）：读取全程防御式，读不到就不处理该行，且每一轮都重新解析，因为侧栏的行会被回收复用。宿主没有 `jobs` 服务时 `jobsBySession` 缺失或为空，自动退回只看原生覆盖的两种情况。
- **定位当前会话**（`src/client/tweaks/locate-current-session.ts`）：在 DSH 侧边栏"工作区"段头部的搜索按钮左边注入一个新按钮。锚点全部走 i18n 与语义片段：通过 `ctx.locale.bind()` 解析当前语言的搜索按钮 aria-label（`workspace` 命名空间的 `search.sessions.aria` 键）与顶部面包屑的 aria-label（`conversation` 命名空间的 `session.hierarchy` 键），locale 服务不可用时退回 `[class*="searchButton"]` / `[class*="crumbs"]` 语义片段兜底。点击后先从**对话头部**读出当前会话的 **id**：`ConversationSessionHeader` 及其上层头部组件都把 `sessionId` 记在 props 上，从面包屑 nav 顺着 fiber 链向上取最近的一个即可（侧边栏会话行记的是同一个值，即 `SessionNodeItem` 的 `props.node.id`，所以"当前会话"和"侧边栏某一行"用的是同一把钥匙）；再用 `ctx.get('workspaces')` 由会话 id 反查所在工作区的 **id**（即使其工作区目录收起也能定位），并按 id 匹配工作区行——id 从 `ProjectRowItem` 的 `props.group.key` 顺着 fiber 链读，不按标题文本，因为两个同名目录的工作区标题完全一样，按标题会展开错的那一个；依次穿透两级折叠——工作区收起时 click 展开、"展开其余 x 个会话"溢出按钮（`[class*="sessionOverflowButton"][aria-expanded="false"]`）挡住目标行时逐次自动点开（宿主每次放 5 条、剩余 ≤5 条时一次全放）直到该行出现——然后用插件自己的 280ms 缓动把该行滚到视口中央（`prefers-reduced-motion: reduce` 下浏览器的 `behavior: 'smooth'` 会退化成瞬时跳转——本机实测 568px 只花 1 帧，所以滚动由插件自己驱动；这段缓动由「侧边栏会话列表」里的「展开动画」开关控制，且只在同区块的总开关（自定义会话显示条数）也开启时生效；未生效时不走 rAF 循环，而是同步 `behavior: 'instant'` 落到目标），认行一律按 id 而不按行上的文字。**0.1.7-alpha.1 起不再靠面包屑标题定位**：该版本把当前项从 `button[disabled]` 换成 `<span class="…crumbCurrent">`（纯文本才能加入窗口拖拽区，harness `92101e1a5b`），而面包屑标题本来就不是可靠的身份——两个会话可以同名，未记录 lineage 的会话干脆直接显示原始 id；标题只在读不到 id 时才作为兜底路径使用（`readCurrentSessionTitle` 同时认新的 span 与旧的 disabled 按钮两种形状，所以 0.1.6 依旧可用），这条兜底路径才会用到 `ctx.get('sessions')`。悬停提示复刻了 DSH 原生 `<Tooltip>` 的自研气泡（fixed 定位 + 主题 token + 500ms 延迟 + 视口翻转），而非浏览器原生 `title`。MutationObserver 监听 `aria-selected` / `aria-expanded` 属性变化同步按钮可用性与挂载状态。**挂载点必须校验、不能只靠"往上数两层"**：DSH 为收起的图标栏（rail）画了**第二个**搜索按钮——`searchButton` 类名与 `search.sessions.aria` 无障碍名完全相同（只是图标 18px 而非 14px），但它直接挂在工作区浏览器根节点上（rail 是 `root > search > searchButton`，展开是 `root > sectionHeader > searchSlot > search > searchButton`）。按旧代码往上数两层会落在 `root` 而不是 `searchSlot`，于是按钮被注入到 React 持有的容器里：图标栏里凭空多一个定位图标，而 React 只会卸载自己创建的 fiber，展开后这个孤儿节点仍然留在 `root` 上、任何重渲染都清不掉，只能刷新页面。因此挂载前先断言两层之上就是 `div[class*="searchSlot"]`，不匹配就不挂（rail 下本就没有段头部，按钮理应缺席），并在每次同步时顺带清掉任何不在 `searchSlot` 里的同名按钮，把这条不变量变成自愈的。
- **设置菜单可滚动**（`src/client/tweaks/settings-nav-scroll.ts`）：DSH 设置面板（`SettingsRoot`）高度固定且 `overflow: hidden`，原生样式只让右侧内容列（`.options`）滚动；左侧菜单列表 `.navList` 没有 `min-height: 0` 与 overflow 处理，条目多时被面板直接裁掉。本调整项用"两条 CSS 规则 + 一个小型 JS 驱动"实现：基础规则 `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 12px; margin-inline-end: -12px` 让列表成为滚动容器，并把滚动条"停靠"进导航栏右侧的 12px 留白里（8px 间距 + 4px 条位，恰好占满留白），滑块悬浮在留白上、与菜单项保持 8px 间距；菜单项上限 `max-width: 164px`（DSH 原生 188 导航 − 2×12 padding）钉住原生宽度，无论滚动条出现与否、悬停还是滚动，菜单项都与原生完全同宽；`::-webkit-scrollbar { width: 4px }` 比全局皮肤细两档。显示时机由 JS 驱动：第一版用 `:not(:hover)` 隐藏滑块，但 Chromium 在宿主 `:hover` 变化时不会可靠重绘自定义滚动条伪元素（实测表现为"点击菜单才出现"），因此改为监听列表 `scroll` 事件——滚动时给列表加 `cst-nav-scroll-show` 类显示滑块（颜色沿用面板继承的 l2 主题 token），停止滚动约 0.8 秒后移除类淡出；MutationObserver 在设置弹窗卸载/重开时保持监听器挂在当前列表上。选择器用"弹窗结构 + CSS Modules 语义片段"双保险（DSH 类名按 `[hash]_[local]` 哈希，`navList` 局部名全 DSH 唯一），无需 `!important`。
- **插件面板记住位置**（`src/client/tweaks/plugin-panel-scroll.ts`）：插件管理面板是 `ui-plugin-manager` 注册的 `main` 槽位面板（key `plugins`），整个界面只有一个滚动区、四个视图由 `navigation-store.ts` 切换（`list` / `package` / `item` / `row`）：`<section class={css.page} data-plugin-panel>` 是 `overflow: auto; height: 100%` 的滚动容器，列表视图渲染 `<header class={css.pageHead}>` 加若干 `<section class={css.group}>`，三个详情视图渲染 `<div class={css.detail} data-plugin-…-detail>` → `<div class={css.detailTop} data-window-drag>`（内含返回面包屑、图标与操作按钮）。**面板是三层嵌套的**：列表为一级、某个插件的页面为二级、它的某个组件的设置页为三级，而每一级在 mnemon 这种带 16 个组件的插件上都够长（实测滚动区约 1800 / 2700 / 1100px，视口只有 860px），所以三级都要记，只记列表会在第二级重现同一个 bug。**视图身份用宿主自己写在页面根节点上的属性**：`data-plugin-detail="<包名>"` / `data-plugin-item-detail="<官方插件 id>"` / `data-plugin-row-detail="<包名>#<组件 id>"`，都挂在滚动区的直接子节点上（与宿主跨插件导航读的是同一批属性），列表视图没有这类属性、但渲染那个 `pageHead`——因此定位一个视图完全不需要猜类名，只有列表用到 `[hash]_[local]` 片段，而 `pageHead` 这个片段**并不全 DSH 唯一**（`dsh-client-ui-schedule` 的 `_pageHeading` 同样会被 `[class*="_pageHead"]` 命中），它安全的原因更窄：它被 `:scope >` 钉在插件面板的直接子节点上，那里只有宿主的列表头能命中。**位置为什么会丢**（0.2.0-rc.2 实测）：滚动区在切换视图时**并不会**重建——同一个 `<section>` 节点前后都能 `querySelector` 到（切到记忆系统那个全局面板时它才整个卸载）；丢位置是纯 CSS 后果，`.page { height: 100%; overflow: auto }`，内容一换上去浏览器就把 `scrollTop` 钳到当前视图能容纳的上限，矮页面即 0。因此每个视图的偏移量要单独记住：面板上挂**被动 `scroll` + 捕获阶段 `click` + 捕获阶段 `keydown`** 三个记录器，面板上再挂一个**只看直接子节点的 MutationObserver** 捕捉视图切换，且只在**换上来的是上一层**（走面包屑返回）时把目标页**自己**的偏移量写回——**记在 0 的页也要写**，那同样是一个位置（不写就会停在钳位值上，见下）——进入一个页面不套用记忆，并在首帧把它置顶。**记录器为什么要三个**是这一项最不直观的地方，两次实测各自否掉了一种写法：一是**偏移量在切页那一刻已经读不到了**——钳位发生在布局阶段，早于 MutationObserver 的微任务，一个并排的探针在回调里读到一个原本在 900 的视图已经变成 0，所以"切走前顺手读一下"这条路不存在；二是**脚本写 `scrollTop` 不派发 `scroll` 事件**——实测 `panel.scrollTop = 500` 之后属性是 500，而随后 400 ms 内零事件（滚轮 / 触摸板 / 键盘 / 拖滚动条则都会派发）。真正管用的是那两个**捕获阶段**监听：导航总是一次点击或一次按键，而捕获阶段在面板上监听早于 React 自己的处理函数（React 18 把监听挂在根容器上，根的冒泡阶段在事件旅程里晚于面板的捕获阶段），也就是钳位尚未发生的最后一个时刻；`keydown` 顺带覆盖空格键驱动的按钮（它的 click 是 keyup 时才合成的）。`scroll` 监听留给捕获看不到的情形：无需按键的视图变化，例如宿主在全局面板失焦时把导航 store 重置回列表。**首次写回就在那个观察器回调里同步完成**（微任务早于下一次绘制），所以切换后的第一帧已在原位，只用 rAF 会先闪一帧顶部。后续帧仍然需要：插件自己的行是**成批异步**到达的，切换后的头几帧面板可能还不够高、偏移暂时够不着，单次尝试会落短。因此「还在变高」必须按**一段静默期**来量，而不是按「比上一帧高」：mnemon 的插件页面上最后一批行是在切页后约 140 ms 才到的（滚动区 2394px → 2687px，t=153ms），按帧比较会在第一个安静帧上就收手，把面板留在离用户原位 253px 的地方——表现正是「返回时页面莫名滚动了一下」。更根本的一步是**把缺的高度先借出来**：视图还装不下目标位置时，面板自己的 `padding-bottom` 先涨上缺的那一段（滚动容器的末端内边距属于可滚动区域），于是切页的第一帧就能把偏移量本身写进去——浏览器在首次绘制前那一次钳位也就没有东西可钳，位置一次到位、之后全程不动；行到齐的过程中借来的高度逐帧收窄，视图自己的高度能装下偏移量的那一帧再把它还给样式表（`borrowHeight` / `repayHeight`）。这中间的约 100–150 ms，屏幕上是行即将出现的位置露出页面自身的底色——这是「不画出马上就要离开的位置」的代价。实测（视口 720px，记忆位置 1850）：改前首帧落在 1674、114 ms 后被推到 1850；改后首帧就是 1850，行到齐那一帧归还借来的 224px，位置纹丝不动。页面确实比记忆位置更矮时（组件已被卸载）借来的高度按缺的那一段留着、把读者留在原位，多出来的那段空白到离开这一页时才归还。现在的重试在四种情况下收手：到达目标、高度静默满 `QUIET_MS`（260ms）、超过 900ms 上限、**用户自己动了面板**（此后位置不再被写回，循环只把借来的高度还掉，且只在归还不会移动位置时）。最后一条是精确判别而非猜测，仍然靠前面那条「脚本写 `scrollTop` 不派发 `scroll` 事件」：重试期间能到达的事件只可能是切页那一次钳位（它带的正是重试已经持有的位置）或真实输入，所以「离开原位的事件」就是用户，重试立刻让位，绝不把人往回拽。实测：用户在窗口内滚到 77 就停在 77，窗口过后滚到 90 也停在 90。**记录器不需要为切换设置静默期**：切换本身可能产生的那一条记录就是钳位事件，它带的永远是"当前视图实际所在的位置"——要么是刚恢复回来的偏移（那是 `min(记忆, 上限)`，浏览器已经没有可钳的了），要么是本插件刚写下的置顶 0（进入，或返回到一个记在 0 的页面），两者都是本插件选定的位置，记录下来只会重复这个选择。这条规律过去有一个例外——记在 0 的页返回时没人写回，落点就停在钳位值上（自制面板实测：来处 2200px 页面内的 1500、目标上限 440 时停在 440，且一次写入都没有）——已由置顶写回堵住。**滚动区上还关掉了滚动锚定**（`overflow-anchor: none`，只作用于这一个滚动区）：锚定本是为了内容在视口上方变化时保持阅读位置，而这里每次导航都整体换掉内容，浏览器挑中的锚点节点在调整生效前就没了，于是它落成一次任意跳动——实测同一条序列，关掉锚定恢复到 1023，开启时被拖到 1316（先对上一帧，约四分之一秒后又被浏览器拽走）。代价是这个面板里"卡片上方内容变高时自动保持视口"的小福利没有了，而在一个内容整体替换的面板上本就没有可供保护的阅读位置。**记忆活在模块作用域**：`detach` 与**插件自身的重挂载**都不清 `offsets`，因为插件管理是全局面板，切到聊天再回来会整个卸载它（且宿主会把导航 store 重置回列表），而本插件的任何一次设置保存又都会整体重挂载全部调整项（`index.tsx` 的 `sameMountInputs` 只放过 `closedWorkspaces` / `historyPageSize*`）——实例级的 Map 会在保存那一刻忘掉除当前页之外的所有位置，之后按「返回」就落回顶部，正是本项要修的那个 bug。重新打开面板本身属于「进入」、不恢复任何位置，但卸载之前记下的位置必须留着：同一次访问里走到那一页的「返回」仍要落在原位。**标题栏固定**用一条 `[data-plugin-panel] [class*="_detailTop"]` 规则（宿主该规则为 (0,1,0) 且不设这四个属性，(0,2,0) 直接压过，无需 `!important`）：`position: sticky; top: 0` 把返回面包屑、插件图标与操作按钮一起钉在滚动区顶端（三个层级都成立），`z-index: 2` 让它盖过从下方掠过的行，`padding-bottom: 12px` 给被钉住时下方留出呼吸，`margin-bottom: -12px` 把这 12px 原样还回去——单写 padding 会让静止时图标行与页面标题之间凭空多 12px，配上等量负外边距后静止版面与原生逐像素相同，而被钉住时那 12px 落在条内、成了图标行与滑过文字之间的缝。背景是 `--dsw-alias-bg-base`，并非猜测：面板滚动区本身透明，其后正是该 token 绘制（`ui-layout` 的 `.frame { background: var(--dsw-alias-bg-base) }`，Windows 标题栏形态下 `.centerCol` 同款），0.2.0-rc.2 明暗两套主题实测与面板逐像素一致（浅色 `#fff`、深色 `#151517`）；内容只占 `.page` 自己那条居中的 960px 列（`.page > * { max-width: 960px }`），两侧留白永远空着，因此盖住这一列就够。挂载时机：面板随它所属的全局面板挂载/卸载，因此由 body 级 MutationObserver（经 `touchesScope` 过滤，否则流式回复的每一帧都会排一次帧和一次全文档查询）跟踪当前匹配 `[data-plugin-panel]` 的元素；挂上时只播种（该视图还没有记忆，才记下它打开时的位置）、从不恢复——打开面板属于「进入」，所以任何设置变更触发的整体重挂载都不会把用户正在看的位置拽走。宿主没有插件管理面板时本项保持惰性。
- **中键关闭侧边栏标签页**（`src/client/tweaks/sidebar-middle-click-close.ts`）：右侧边栏的标签芯片是 `div[role="tab"][data-dockkit-tab="<tabId>"]`，由 `ui-dockkit` 的 `TabPanel` 渲染，而 dockkit 只有右侧边栏（停靠面板与浮动层）采用，因此"芯片"即"侧边栏标签页"。本项在 `document` 捕获阶段挂三个监听（React 17+ 把监听挂在根容器上，document 捕获先于整棵 React 树，拦截因此彻底）：`pointerdown`（中键）拦截传播，芯片自带的按压→拖拽手势无从启动，按住中键移动 ≥4px 也不会再把标签拖走、分屏或浮出；`mousedown`（中键）`preventDefault`，抑制浏览器在标签条上的自动滚动（不影响其后仍会派发的 `auxclick`）；`auxclick`（中键，浏览器对非主键点击只派发 `auxclick`、不派发 `click`）读出芯片上的 `TabId` 交给 `ctx.sidebarRight.close()`——关闭完全走宿主 store 自己的规划规则（缺失标签无事发生、唯一驻留引导页不可关、关闭最后一个停靠标签时侧边栏收起），插件不复制任何一条。`ctx.sidebarRight` 是 0.1.5+ 宿主才提供的服务，且由 `ui-sidebar-right` 在**它自己的插件 fiber** 里 provide——cordis 的属性访问只沿祖先 fiber 链解析，从兄弟插件读会直接抛错（"cannot get property … without inject"），而把它加进本插件的 `inject` 会让服务变成必需、在 0.1.2 宿主上卡死启动；因此该 face 在每次中键关闭时经 `ctx.reflect.get('sidebarRight')` 解析——reflect 实例与 store 为根共享、provide 的隔离键也登记在根，`get` 无需 inject 声明即可跨 fiber 读到兄弟提供的服务，未提供时返回 `undefined` 而非抛错（0.1.2 宿主 → `undefined`，本项保持惰性，仅保留副作用抑制）；`close()` 在无挂载 seat 时抛错，统一吞掉。浮动面板的头部不渲染芯片，其中键关闭转发给头部自带的 ✕ 按钮（`canCloseTab` 不允许时按钮不存在，无事发生），头部的"停靠回面板"按钮被显式排除；按压与释放不在同一芯片上时，浏览器把 `auxclick` 派发到两者的公共祖先，命中不了任何芯片，同样不会关闭。
- **右侧边栏初始宽度**（`src/client/tweaks/rightbar-initial-width.ts`）：右侧边栏的宽度由宿主 `ui-layout` 决定——其 `openRightbar` action 在首次打开时用 `rightbar ??= max(300, round(viewportWidth × 0.45))` 填入 45% 的 px 值（常量 `RIGHTBAR_DEFAULT_RATIO`），拖拽经 `setRightbar` 覆盖（钳制到 `[300, 窗口 × 70%]`），其后关闭 / 再打开都保留该 px；宽度偏好只存在内存 store 里，刷新即回到 `null`。`ctx.layout` 只暴露 `openRightbar(track, fullscreen)` / `closeRightbar()` / `toggleSidebar()` / `selectPanel()`，改宽度的 `setRightbar` 挂在控制器自己的 `panels` 动作集上（TS 层是 `private`，运行时是普通字段）。本项因此包装控制器**实例**的 `openRightbar`：本次页面加载的第一次打开时，先按 `[data-rightbar-col]` 的父元素（宿主测量 `viewportWidth` 的同一个 frame 元素）实测宽度算出 `round(宽 × 百分比)`，经宿主自己的 `panels.setRightbar` 写入，再转发原调用——写入与打开落在同一次 React 提交里，不会先闪一帧 45%；全程不碰 grid 模板与面板 inline 宽度，因此列解算、拖拽手柄位置与面板宽度天然一致。两个页面级标记守住语义：`__cst_rightbar_initial_width_seeded__` 保证每次加载只写一次；`__cst_rightbar_initial_width_dragged__` 由挂在 `[data-side="rightbar"]`（宿主右列拖拽手柄）上的**一次性**探针在首次 `pointerdown` 时置位——用户一旦亲手拖过，本次加载内本项彻底不再写入，否则每次设置变更触发的整体重挂载都会覆盖刚拖出来的宽度。右栏在本项挂载时已打开（用户在设置面板改百分比）则立即按新比例写入，即所见即得的实时预览。宿主未提供 `layout` 服务、或控制器不再携带可调用的 `setRightbar` 时保持惰性；卸载只在当前值仍是自己的包装时才还原宿主方法，不踩其它插件的包装。
- **自定义侧边栏会话条数**（`src/client/tweaks/sidebar-session-count.ts`）：宿主把每个工作区的会话列表折成 5 条（`COLLAPSED_SESSION_LIMIT`），该上限是浏览器组件里的一个 `useState`，持久化视图 store 只存 `groupBy / orderBy / groupExpansion / sessionOrderByAccount / archivedFilter`——没有任何设置、插槽或 store 动作能从外部够到它，因此本项**驱动宿主已经渲染的那个控件**，而不是替换它。宿主的溢出按钮带 `data-row-key="overflow:<groupKey>"` 与 `aria-expanded`（全部显示后为 `true`），按它是让宿主多渲染行的唯一途径，本项于是代用户按它，再决定屏幕上留什么：**撑开**（连按到渲染行数不少于配置条数；宿主每次 +5、剩余 ≤5 时直接跳到全部 `Infinity`，所以循环要么在行数达标、要么在按钮消失时终止）、**裁剪**（隐藏超出配置条数的行——行自身没有内联样式（0.1.7-rc.2 实测），一个标记属性 `data-cst-sid-hidden` 加一条 `display: none !important` 规则即可，宿主重渲染只要元素不变、标记就不丢）、**改标注**（整体隐藏宿主按钮（样式层，不是脚本层——宿主与行在同一次提交里插入按钮，观察器两个 microtask 后才够到它，脚本隐藏会漏出一段时间的错误计数），再用插件自己的 `data-cst-sid-button` 顶替：文案取自宿主 `workspace` 命名空间的 `sessions.expand` / `sessions.collapse`，数字是诚实的剩余条数——宿主标签里的「还有 N 条」加上本次裁剪扣住的行数，即 `总数 − 显示数`）。点插件按钮只改裁剪计数，撑开永远交回宿主，所以长列表背后仍是宿主自己的「全部显示」状态；收起则裁回初始条数，而不是请宿主折回 5 条（宿主的折叠表达不了自定义条数）。**展开过程一概可见**：早期版本在撑开期间给列表加 `visibility: hidden` 想遮住 5→10→15 的阶梯，但那个窗口只有一帧（一次按压就是一次渲染，远小于 100ms），短到仍会被读成闪烁——列表消失又回来，而宿主自己的行滑入动画本就把几步呈现为一次生长，所以现在始终展示生长。**按钮随撑开的第一次落点发布**：数字不需要等，总数 = 宿主「N more」标签 + 已渲染行数、显示数 = 本次裁剪数，两者都来自一次读取；但 `shown` 是这一轮 pass 最终会停的块、撑开途中还可能变（展开工作区时行先渲染、应用随后才标选中行），所以在撑开开始前发布会让数字先承诺 7 行、落定却是 14 行（2026-09-28 用户报的「x 数字还会变一下」），现在的发布落在撑开的**第一次落点**上、只晚一两帧（实测原先要到 t=199ms 才出现，而 11 行早在 ~50ms 就已全部上屏）；唯一无法在落点发布的是宿主标签里没有整数（已全部显示，或尚未绘制），那一轮按落定后的数字发布。**总数缓存只在「宿主还在折叠」时可信**：宿主一旦不再渲染自己那个溢出按钮（它自己的 5 行折叠已经藏不住任何东西），就等于「它把所有会话都渲染出来了」，缓存直接作废——否则归档 / 删除会话之后按钮会继续报一个不存在的剩余数（实测形态：9 条会话、配置 7，归档 6 条后按钮仍写「展开其余 6 个会话」，按下去只是把同一个数字再写一遍）。**数字与按钮分支读同一个值**：`publish` 判定「有剩余」和按下去判定「该撑开还是该收起」都用同一份 `shown`，因此不会出现「按钮说有剩余、按下去却收起」的错位。**等待机制**：行滑入约 200ms（`ROW_GLIDE_MS`）且离场的行仍留在 DOM 里，窗口内计数会把正在离开的行算进来，因此另有一次 `GLIDE_SETTLE_MS`（300ms）的纠正 pass；等待以 rAF 为主并回退到定时器（被遮挡的窗口会挂起 rAF），每次落定还带墙钟上限，不会把某个组永久锁在「忙」状态；落在某一轮 pass 期间的按压被排队、由该轮的释放阶段接走，而不是被丢掉。**选中行永不隐藏、也不被截断**：打开会话（包括经宿主搜索打开并滚动到该行，以及经「定位当前会话」找到）会把它标成 `aria-selected="true"`，裁剪只砍它下方的行——它上方一律保持可见，隐藏区因此永远是已渲染行的**后缀**，绝不会把该行画到折叠线的下一行（新可见区 = **覆盖该行的下一个配置尺寸**——`初始条数 + 整数倍步长`，例如初始/步长都是 7 时第 9 条 → 14 条、第 15 条 → 21 条；插件按钮也从这一组当前的块而不是配置初值增长；**这个抬高会记在该组上**（`applyTrim` 把它写回 `data-cst-sid-trim`；选中行要求的下限另有 `data-cst-sid-selection`），所以点列表中更靠前的会话时列表不会缩回配置条数、把刚看过的行藏掉；折叠工作区会重置「展开其余」堆出来的那部分（折回来是紧凑的），但**当前选中行要求的尺寸会保留**并在展开时把列表重新撑开——宿主展开折叠组时只渲染它自己的 5 行上限，选中行往往不在 DOM 里，这个地方丢了就再也量不出来；**改设置只是重新挂载，不是折叠**（2026-09-26 修）：四个闩锁（trim / pressed 标记 / 总数缓存 / 选中要求）在重挂载时留在组上——`cleanup()` 只撤 DOM 补丁、不再清它们——所以保存任何设置都不会把已展开的列表收回去，而新条数对没有闩锁的列表立即生效；清闩锁只有一处，就是关掉总开关（`resetSidebarSessionCountLayout()`，插件整体卸载时同））；**被裁掉的行重新显示是缓动的**，`opacity` 与 `height` 各 160ms，让列表"长"出来、下方内容跟着滑，而隐藏方向仍是瞬时——超折叠的行必须从未出现在画面上；宿主自己的行动画与浏览器的平滑滚动在 `prefers-reduced-motion: reduce` 下都不执行（本机即是），所以这两处动效由插件自己驱动，并由同一区块的「展开动画」开关统一管辖（**默认关闭**，即一帧到位；开启后揭示 160ms、定位滚动 280ms；关闭时定位滚动同步执行、不再等一帧；这两个动效还要求同区块的总开关也开着——总开关关闭时侧边栏与定位滚动都回到 DSH 原样））；宿主自己为「揭示某行」把组的限值抬到全部时，行会先渲染出来，可见区在下一个 tick 一并抬到该行。**静止时零开销**：每组对一轮 pass 读写的全部内容做指纹，状态未动就跳过该组，侧栏因其它原因频繁更新时也不会为每个打开的组各买一轮 pass。锚点全部按稳定的语义片段匹配（`groupSection` / `sessionOverflowButton` / `list` 等 CSS Modules 片段会随构建旋转），`data-row-key` 是宿主自己的契约并带着组 key——也就是每组状态的主键。**「工作区树」分组下按归属隔离**：该模式会把子工作区的 `groupSection` 嵌进父组（宿主 `renderGroup` 的顺序是 `[工作区行, div[role=group]{子组}, 本组自己的会话行, 本组的溢出按钮]`），所以行、宿主溢出按钮、选中行与本插件自己的按钮一律按 `closest(groupSection) === 本组` 过滤；不过滤的话，父组的裁剪会把子组的行算进自己的名额、把父组真正的会话行标成隐藏，而裁剪只会跑在最内层那个组上——那些行再也回不来。**插件自己的按钮按实例令牌认领**：按钮上记着接线它的那次挂载的令牌，不是本实例的一律替换而非复用，因此一次「撑开途中保存设置」（整体重挂载）留下的按钮不会被新实例当成「已接线」而永久失效；清理也只删自己令牌的那些。

- **经典统计行**（`src/client/tweaks/legacy-stats-line.tsx`）：0.1.5 起 DSH 把输入框下方的统计行（旧 `StatsLine`）换成了图标胶囊（新 `StatsPills`），两者挂载方式相同——都是 `conversation.composer.dock` 列表槽位上的条目。列表槽位的规则是同一 id（同一"格"）里 priority 最低的存活条目渲染，因此本调整项在开关打开时用 `priority: -2` 影子覆盖原生条目（走槽位系统自己的遮蔽机制，无需 CSS 隐藏或 DOM 修补；它比"缓存命中两位小数"的 `priority: -1` 更优先，见下条），销毁注册即把格子还给原生胶囊；若条目渲染崩溃会自动退位，胶囊原样回来。格子随宿主代际变化：0.2.0 及之前是一个 id 为 `stats` 的条目同时装两枚胶囊，0.2.1-alpha.1 拆成每枚胶囊一个条目——`activity`（order 0，轮数/步数 + 速度）与 `usage`（order 1，token 总量 + 缓存命中）；id 与 order 由 `composerStatsCells`（`composer-dock.ts`）从槽位账本读出（原生条目是 priority 0 的占用者——同 id 同 priority 二次注册会抛错，所以那一格只可能是宿主的；插件自己的影子注册得更低，不会误认），经典统计行认领第一条格子渲染整行，其余格子注册一个渲染 `null` 的条目压住（该行本就带 token 数字，留着第二枚只会重复一份），替换条目沿用原生条目的 order，dock 排列不变。数据面与新胶囊一致：读 `sessionStats`（整段日志的轮数/步数/耗时）与 `tokenUsage`（计费桶）两个持久化投影，不再做旧版"可见窗口折叠"的兜底（无投影时整行不渲染，符合旧行"无数据不出行"的规则）。文案走插件自己的 `style-tweaks` 命名空间（`legacyStats.*` 键）——旧版 `stats.llm` 系列键在 0.1.5 的词典里已被删除，插件自带中英文案；行样式（居中、三级文字色、省略号截断）按 0.1.2 的 `StatsLine.module.css` 移植，token 全部沿用原值并带兜底。行皮肤按宿主的 dock 代际自适应：0.1.6-alpha.2 把 dock 槽位的输出移进了 InputBar 内部一个居中 flex 行（与新的上下文占用按钮 ContextMeter 并排，槽位输出不再是输入卡片下的独立一行），行根元素挂载时探测其布局父级（跳过槽位渲染插入的 `display: contents` 包装层——包装层不生成盒子，其 `flexDirection` 恒为初始值 `row`，直接读会把两代 dock 都判成横向）——纵向 flex 容器（alpha.1 及更早宿主，行直接挂在卡片下）走旧皮肤：行根元素带 `data-composer-stats` 标记，宿主 InputBar 会围绕任何挂载的统计行把自己的 8px 底距收紧到 4px（`.root:has([data-composer-stats])`），行自身补 4px 顶距 + 2px 底距使总高与胶囊行（26px 行 + 4px 宿主底距）一致；横向 flex 容器（alpha.2 的 `.dock` 行，自带 4px 顶距、根底距固定 4px，`data-composer-stats` 规则已删除、标记失效）走新皮肤：行按内容自适应大小、不带任何纵向 padding，与胶囊一起按宿主原生 12px 间距居中排布——两种代际下开关切换时对话内容与输入框都不再上下位移。缓存命中率的小数位数跟随"缓存命中两位小数"开关：开启时按两位小数，关闭时按 0.1.2 原样取整；该开关在挂载时捕获，任何设置变化都会重挂载全部调整项，因此始终即时生效。
- **缓存命中两位小数**（`src/client/tweaks/pills-cache-hit-decimals.tsx`）：新胶囊的命中率取整发生在 dsh-client-ui-chat 模块内部的格式化函数里，插件无法触及，因此本调整项在开关打开时对承载它的槽位格做影子替换（`priority: -1`），由插件自绘那一部分——胶囊与点开弹窗按 0.1.5 的 `StatsPills` / `stat-dialog` 逐样式移植（定位与外点关闭直接复用宿主 primitives 的 `useAnchoredPosition` / `useDismissOnOutsidePointer`，并按 0.2.1 补上"外点单击同样关闭"：键盘激活兄弟胶囊只发 click、不发 pointerdown，缺这条两个弹窗会叠着开），缓存命中率改走插件共享的 `formatCacheHitPercent(…, 2)`（按两位小数取整，靠近 100% 时仍按"诚实尾数"多显示一位，如 `99.97`），弹窗各行与胶囊标签同步生效。认领哪一格随宿主代际：0.2.0 及之前只有一个 `stats` 格，插件连整行一起自绘（两枚都在）；0.2.1-alpha.1 起每枚胶囊各占一格，而缓存命中只出现在 `usage` 那枚，因此本项只认领 `usage` 格（同 id、同 order、`priority: -1`），`activity` 胶囊留给宿主原样渲染——改动面最小，也不必再维护一份宿主的轮数/步数逻辑。替换条目自带 `data-composer-stat="usage"`（0.2.1 起每枚胶囊的稳定钩子），字号与行高沿用宿主条目根的 12/20 档，与旁边的原生 `activity` 胶囊逐像素对齐。数据面同样是 `sessionStats` / `tokenUsage` 两个投影（不做窗口折叠兜底）；整行模式（≤0.2.0）下根元素带 `data-composer-stats` 标记（0.1.6-alpha.2 已删除对应的宿主底距规则，该标记只在更早的宿主上生效），行皮肤按 dock 代际自适应（见 `composer-dock.ts` 与上一条的说明）。图标方面，整行模式自绘的 gauge 图标在 0.1.3+ 的 primitives 里才存在，故运行时从宿主 primitives 取 `IconGaugeOutline16`，老版本宿主取不到则回退为时钟图标（0.2.1+ 上 gauge 那枚是宿主自己的，与插件无关）。与"经典统计行"的层叠关系：两项写同一批格子，经典统计行注册在 `priority: -2` 优先渲染（它认领第一条格子渲染整行、其余格子以 null 压住），本项在其下被遮蔽（不渲染、零开销）；经典统计行关闭后本项若仍为开则自动接管它对应的格子（0.2.1+ 上只有 `usage` 一格），两者都关时恢复原生胶囊。该开关始终显示，不再随经典统计行隐藏：经典统计行同样读取它决定命中率的小数位数。
- **本轮用时和速度**（`src/client/tweaks/turn-time-pill.tsx` + `src/client/tweaks/assistant-stream-timing.ts`）：0.1.6 的 `TurnUsagePanel.tsx` 里并排放着两个组件——`TurnUsagePanel`（数据图标 + 用量）与 `TurnTimePanel`（时钟图标 + 用时，点开"本轮用时和速度"弹窗），`TurnTailNodeView` 把它们作为一个 fragment 传给动作行的 `usageAction`；0.1.7-alpha.1 的性能与用量偏好提交删掉了 `TurnTimePanel`、`TurnTailChatData` 里的 `ttftMs`/`tokensPerSecond`、`formatLatencySeconds` 以及 `message.ranFor` + 整组 `message.turnTime.*`。本项把用时那一半整体装回来：胶囊、弹窗、以及弹窗里 0.1.6 的三行。位置：走的是插件唯一能进到宿主 chrome 里的路——在 `conversation.chat.assistant-actions` 列表插槽（该列表渲染在复制与分叉按钮之间）挂一个不可见锚点，再从锚点把可见胶囊 portal 进行尾自己的尾随簇，即宿主包住 `usageAction` 与时钟的那个 span（按结构取"带 `data-clock="end"` 的行的最后一个元素子节点"）。portal 在簇里落在最后，因此两条 CSS 规则把它放回 0.1.6 的座位：时钟（簇内 `_timeEnd` 后缀的那个 span，也就是 portal 在 DOM 里的前一个兄弟）被 `order:1` 排到胶囊之后，与用量胶囊之间 8px 的 flex 间距按 0.1.6 自己的 `.root + .root` 配对规则回退 6px，于是行读作「用量 → 用时 → 时间戳」，与 0.1.6 一致；用 `order` 而不是插队 DOM，位置就不受 React 插入宿主自己子节点的时机影响（簇里没有用量胶囊时不回退间距，没有时钟时胶囊收尾）。数值：0.1.6 读的是 Chat 快照 turn location 的墙钟与节点内存 timing，这两者在 0.1.7 的节点数据里都已不存在，因此三个数字都从会话事件窗口折算——用时走 `turn/start` → `turn/end`（`deriveTurnRunMs`），输出速度与 TTFT 走结算内嵌的模型流（`deriveTurnSpeedMetrics`）。后者正是会话格式 v2（0.1.5）架构笔记预期的"需要精确证据的消费者"：v2 把每次模型尝试的精确时序流嵌进持久化结算（`assistant/message` 的 `data.stream`），但 Chat 界面的冷呈现直接从组装后的消息构建、不回放嵌入流（笔记原文："Cold settled presentation therefore does not reconstruct per-token timing"）——轮次尾部的折叠读节点内存 timing，其 `firstTokenTime` 只在 live-chunk 线性折叠中存活，重载后每轮的输出速度（TPS）与首 token 用时（TTFT）全部消失，"本轮用时和速度"弹窗只剩墙钟总用时。插件把 dsh-llm 的紧凑流读取器（`assistantStreamFirstTokenTime`：按 `time0` + `dt` 间隔重建打包 run 内首个 token 的时间）与 0.1.5 `deriveTurnMetrics` 的折叠一并移植——TTFT 取最低 step 的"派发→首 token"延迟，TPS = 携带时序与用量的 step 的 Σ输出 token ÷ Σ解码墙钟；数据全部来自持久化日志，历史会话与刚完成的轮次拿到相同数值。时序：一轮结束后尾节点才存在，数值已经定型；若 `turn/end` 尚未进入窗口（或被窗口上限淘汰）则订阅 `eventSource` 直到墙钟出现再停（结算事件总在 `turn/end` 之前，因此那一刻两个派生量都已就绪）；窗口里没有该轮 `turn/start` 时不渲染胶囊，保持 0.1.7 原样。弹窗：宿主 stat-dialog 座位的移植——同样使用宿主自己也在用的公开原语（`useAnchoredPosition` 做触发点上方的视口钳制定位、`useDismissOnOutsidePointer` 做外部点击关闭）加一个 Escape 处理，皮肤照抄 `stat-dialog.module.css`，明细网格带宿主的 `data-turn-time-details` 标记，行序与"只在有值时出行"都沿用 0.1.6 的 `TurnTimePanel`（总用时 → 输出速度 → 首 token 用时）；两行标签取自插件自己的 `style-tweaks` 词典（宿主仍存活的 `stats.dialog.speed` / `stats.dialog.ttft` 是给作曲器那份"会话统计"弹窗措辞的——`ttft` 写作"首 token 平均"，对单轮并不成立），数值里只有速度仍取宿主词典存活下来的 `message.tokensPerSecond` 键，两处时长与标签同理取插件自己的词典（`durationSeconds` / `durationMinutes` / `durationHours`）——0.2.0-rc.2 删掉了宿主那三个整串时长模板（换成裸单位与 `compact*`），原样借用只会打印出键名。三行在挂载时一次渲染完，面板不再被追加内容，因此首帧就是最终高度（旧版"先渲染一行、开弹窗时再注入两行"需要把卡片同步上移以避免闪一下，已被整体渲染取代）。选择器安全性：所有钩子都是结构化的（`data-turn-tail` / `data-clock="end"` / 簇内 `_timeEnd` 后缀 / `data-turn-time-details`），胶囊自己的类名带 `cst-ttp-` 前缀；宿主若改名 `timeEnd`，退化为胶囊落在行尾。
- **过程组显示调用次数**（`src/client/tweaks/turn-process-counts.ts`）：0.1.6 的 `TurnProcessNodeView` 把 `node.data.toolCallCount` / `messageCount` / `subagentCount` 里的非零项用 `message.turnProcess.separator` 连成标题（三项全为零时退回"已思考"）；0.1.7-alpha.1 的性能与用量偏好把标题换成了用时文案（`message.turnProcess.took` / `deepDivingFor` / `failed` / `stopped` / `worked`），但三个计数本身没有消失——节点数据仍在，宿主也仍把 `data-turn-process-tool-calls` / `-messages` / `-subagents` 写在折叠按钮上（`button[data-turn-process]`），整组 `message.turnProcess.*` 计数文案也仍在 chat 词典里。过程组是对话流里的节点视图而非插槽，插件没有渲染位，因此本项走 DOM 修补：给宿主那个按钮追加一个 `span.cst-tp-counts` 子节点，宿主自己的子节点一概不碰；文案按 0.1.6 的规则重建（计数为零或属性缺失的项不出行、单项取 `one` 键、多项用宿主自己的 `separator` 连接，且分隔符放在串首，读起来就是宿主标签的延续——窄行里标签被省略号截断时，分隔符也不会孤零零留在标签尾巴上）。顺序用 CSS 的 `order` 定，而不是靠插入位置：计数要读在宿主标签之后、折叠箭头之前，而箭头是条件渲染的（`canCollapse`），React 后补时会把它 append 到按钮末尾、正好落在计数之后，因此计数带 `order:1`、箭头带 `order:2`（宿主按钮本身就是 `display:flex`），宿主怎么重排自己的子节点都不影响阅读顺序；计数沿用宿主的字号与行高 token 并 `flex:none`，标签仍照原样收缩省略。同步走一个挂在 `document.body` 上的 MutationObserver：`attributeFilter` 只盯那三个计数属性（`data-open` / `aria-expanded` / class 抖动不触发扫描），childList 只遍历新增子树并按 `button[data-turn-process]` 匹配，因此一次扫描的开销取决于这一批 DOM 动了多少、而不是文档有多大，批内记录合并到一个 microtask 里跑一次；宿主用别的方式渲染过程组（没有这些属性）时本项保持惰性。
- **过程内容上方显示用时**（`src/client/tweaks/legacy-running-header.ts` + `turn-count-stream.ts` + `turn-tally.ts`）：0.1.7-rc.2 的 `TurnProcessNodeView` 一轮一开始就渲染过程组，而那个折叠按钮是禁用状态——`canCollapse = foldable && hasContent && !turnProcessAlwaysOpen(node)`，而 `turnProcessAlwaysOpen` 对每个 `open` 轮次都为真，所以那行读作标题而非控件。0.2.0-rc.1 改了两件事：`TurnProcessNodeView` 在轮次关闭前返回 `null`（运行标签因此无处可画），同时运行标签被移到了末尾那条蓝色 `RunningStatus` 行上。本项用两个都不属于宿主的锚点把标题补回来。**位置**：宿主为运行中的轮次挂出、却因为节点视图返回 `null` 而一直留空的那个 flow item——`div[data-chat-flow-kind="turn-process"]`——该轮次的工具行与思考行是它的后继兄弟节点，所以这个空壳正好落在 0.1.7 标题当年的位置；标题注入它内部那个 `display: contents` 的 slot 包装器，宿主仍掌握外围布局，插件只多加了一个节点。**数字**：`turn-count-stream.ts` 折叠的就是宿主自己折叠的那批 Session 事件，它同时给出三组计数与该轮次的 `turn/start` 时刻，因此耗时是按一个诚实的起点算出来的，而不是每秒去刮一次宿主那条流光标签的文字；`turn-tally.ts` 让两个调整项共用同一套计数词汇与时长模板（0.2.0 换掉了整串式的时长模板，原样向 `chat` 座位借会打印出键名——TypeScript 查不出来，因为 `TranslateNS` 与运行时词典并不同步）。事件契约踩过的三个坑都写在文件头：`registerDefinition` 对重复 `kind` 直接抛错（故 kind 取自 `globalThis` 计数器）、`start` 里折叠过的证据引擎会再交给 `update` 一遍导致计数翻倍（故 state 里存 `foldedThrough` 水位线）、`turn/start` 落在载入窗口之外的轮次会一条都数不到（故每个匹配事件都声明 `role: 'start'`）。注册走局部 `ctx.inject(['uiConversation'], cb)` 而不是插件自身的 `inject` 导出——后者会让整个插件在旧宿主上永不激活，而 cordis 又禁止读未声明的服务。**它不碰宿主的东西**：末尾那条蓝线既不隐藏也不改样式，本项从不写它的任何属性；标题行的类名只有自己的，刻意不带 `cst-tp-counts`（那类的每条规则都要求它是折叠按钮或蓝线的直接子节点，带上既匹配不到、又会让将来一次全文档查询把标题误认成另一项的计数）。标题是 `div` 而非宿主的 `button`，没有 `aria-expanded`、没有箭头、点击无反应——一个假装自己能折叠的标题比它旁边 0.2.0 那套更糟。**它随第一行内容出现**，判断用几何而不是类名：一个轮次最初几秒是宿主自己 `height: 0` 的空 flow item，第一个工具调用还在路上时它们都没有高度。遍历有两处不可省的排除：跳过蓝线本身（`RunningStatus` 是流程列的子节点，朴素的"第一个可见兄弟"会撞上它，把零输出读成有输出——标题就会浮在还空着的组上方，第一版就中过这个 bug；验证这一条时**必须让蓝线保持可见**，把它一并藏掉，断言就永远不会失败），以及以 `data-chat-turn` 设界（`ChatNodeList` 把排队 / 追加气泡 append 到列尾，那些气泡不是 flow item、没有这个属性，却有高度）。
- **统计弹窗不透明**（`src/client/tweaks/opaque-stat-dialogs.ts`）：0.1.7-alpha.1 的设计决定"Compact translucent menu surfaces"（harness 笔记 2026-09-17）把菜单 / 卡片材质从"不透明"换成了"半透明 + 背景模糊"：`--dsw-specific-menu` 由 0.1.6 的 `var(--dsw-alias-bg-layer-3)` 变成 `rgba(248,249,250,0.58)`（浅色）/ `rgba(48,49,54,0.5)`（深色），并新增 `--dsw-menu-backdrop-filter: blur(40px) saturate(150%)`，凡是画这层填充的表面都必须成对使用（宿主自己的样式检查会拒绝"只填不加滤镜"的材质层）。本项**只**把这五张统计弹窗换回不透明：输入框下方的会话统计与 token 用量（`ui-chat/README.zh.md` 里的「统计交互卡片」）、行尾的每轮用量与用时、上下文占用按钮点开的面板。**为什么不用 token**：`--dsw-specific-menu` 就是整个高层级表面家族的定义点，重指向它会把所有菜单与面板一起改掉，范围远超这五张弹窗（这是本项的第一版做法，收窄后弃用）。**怎么精确定位这五张**：其中三张（行尾用量、输入框下的会话统计与 token 用量）是宿主同一个 `stat-dialog` 面板（`ui-chat/src/client/chat/stat-dialog.module.css`，直接子节点是 `.title` / `.titleRule` / `.details`），上下文那张是 ContextMeter 面板（直接子节点 `.header` / `.bar` / `.rows`），另外两张是本插件自己的移植面板（`.cst-ttp-panel` / `.cst-pilldlg-panel`，普通命名、无需猜测）。宿主没有给这两类面板挂任何 `data-*` 标记，而它们的类名形状（`*_panel` + `role="dialog"`）与一批**无关**弹窗完全一样——设置面板 `SettingsRoot.panel`、文档预览的 `FontNotice.panel`、agent team 的 `TeamAction.panel`、存记忆确认弹窗；因此靠它们各自的直接子节点区分：`:has(> [class$="_details"])` 与 `:has(> [class$="_rows"])`，与本仓库其它结构化钩子（`[class$="_timeEnd"]`、`[data-turn-tail]`）同一套思路，也是把设置面板等弹窗挡在外面的那一步（实测：设置面板打开时选择器命中数为 0）。**特异性**：宿主规则是 `.panel`（0,1,0），插件自己那两个面板也是（0,1,0），因此这里的每条规则都带一个 `body` 元素前缀——多一个元素选择器即可压过，既不用 `!important`，也不依赖插件内部哪个样式表后注入。**故意不动 `backdrop-filter`**：填充不透明后模糊被完全盖住、视觉上等于不存在，而留着它能保持宿主自己的隔离与包含块语义（少数表面把材质画在隔离的 background 伪元素上，或依赖滤镜给 fixed 浮层提供包含块）。深色主题不需要单独取值，layer-3 本身就是主题的深色表面色；0.1.7-alpha.1 之前的宿主本来就画这个不透明值，因此对老宿主是等值空操作。附带修正：插件自己两个移植面板（`pills-cache-hit-decimals` 的弹窗、`legacy-context-meter` 的面板）此前漏抄了 0.1.7 新增的那条 `backdrop-filter`（`turn-time-pill` 那处移植时已带上），现已补齐——卡片不透明时它不可见，但关掉本项后插件弹窗与宿主弹窗的材质才真正一致。
- **上下文占用按钮不显示悬停信息**（`src/client/tweaks/context-pill-no-tooltip.ts`）：0.1.6-alpha.2 的 ContextMeter 胶囊由 ui-primitives 的 `Tooltip` 包裹，气泡（`span[role="tooltip"]`）是 `cloneElement` 锚点后的**相邻兄弟节点**，因此一条纯 CSS 规则即可精确隐藏：`button:has(> svg[viewBox="0 0 14 14"] > circle) + span[role="tooltip"] { display: none }`。锚点的结构判定是全 UI 唯一的：客户端 UI 里所有带 `circle` 的图标（gauge、database 等）都是 16×16 viewBox，只有 ContextMeter 的圆环是 `0 0 14 14` 的两段 circle（TodoPanel 的 14×14 字形是 path/rect，无 circle），且 `+` 相邻兄弟选择器把气泡只绑定在它自己的锚点上——输入区的其他 Tooltip（+ 按钮等）与插件自绘统计行的悬停提示都不含该 svg，不受影响。规则对悬停与键盘聚焦两种触发一并生效（同一个气泡元素；明细弹窗本就是完整信息的入口）；气泡由 React 状态驱动渲染，隐藏是在渲染后的样式层完成的，不改宿主行为、无 JS 监听。0.1.6-alpha.1 及更早的宿主没有 ContextMeter，选择器匹配不到任何元素，本项保持惰性。
- **上下文圆环回到输入框内**（`src/client/tweaks/legacy-context-meter.tsx`）：0.1.6-alpha.2 把 ContextMeter 从输入框工具行挪进了卡片下方新增的 `.dock` 包裹层（圆环+百分比胶囊，与统计行同排）。本项恢复 0.1.6-alpha.1 及之前的样式：28px 纯圆环按钮回到工具行里发送键左侧的位置。做法上不走 DOM 搬运——原生胶囊是 React 持有的节点，而 React 18 提交插入时按 fiber 树（`getHostSibling`）而非 DOM 找 `insertBefore` 参照、也不校验参照节点是否还是容器的子节点，把胶囊搬走后统计行一旦挂载就会在提交阶段抛 NotFoundError 崩掉整个应用；因此与"缓存命中两位小数"同法，本项在 `conversation.input.right` 列表槽（工具行右侧组，`.trailing` 内正常 flex 流）上注册一个移植单元：alpha.1 的 ContextMeter 组件逐样式移植（28px grid 圆环、悬停读数、点击展开的 264px 占用明细弹窗、外点与 Escape 关闭、`contextOccupancy` 折叠逻辑原样移植），数据走同一对 `contextPressure` / `contextBreakdown` 投影，悬停气泡直接复用宿主 primitives 的 `Tooltip`，弹窗沿用 alpha.1 的绝对定位皮肤（挂圆环上沿右侧对齐）。宿主代际由单元自身探测（layout effect，首帧前落定）：从自身位置穿透 `display: contents` 锚点找到所在会话卡片，再查 InputBar 根的直接子 div 中是否有类名带 `_dock` 局部名的包裹层——存在即 alpha.2+ 代际，移植环渲染；不存在（0.1.6-alpha.1 及更早）则单元只渲染一个 `display: none` 的 ref 空壳（探测需要挂点，空壳不参与布局也不会多出一份行间距），原生环本就在该位置，本项完全惰性。三条配套 CSS 规则：`[class*="_dock"] > span:has(> button > svg[viewBox="0 0 14 14"] > circle) { visibility: hidden; width: 0; margin-left: -12px }` 隐藏原生胶囊——用 `visibility` 而非 `display`，且只把宽度收成 0，是因为那个盒子还要留下 22px 的高度地板：统计行的两种呈现分别高 20px（经典行）与 22px（胶囊行），胶囊整盒消失后切换统计行（或进入没有统计数据的会话）都会改变 composer 的高度、把整个输入区上下推一下（原生胶囊一直占着这 22px，这正是 alpha.2 下切换统计行不跳的原因）；保留真实盒子的高度还会自动跟随字体大小偏好，不用写死数值，而 `visibility: hidden` 同时把胶囊从命中测试与无障碍树里摘掉；`margin-left: -12px` 抵消 dock 的 12px 间距，让统计行仍精确居中在卡片轴线上（与 alpha.2 前那行文本的位置一致）。`order` 两条把移植环排到模型芯片之后、停止/发送按钮之前（`conversation.input.right` 的单元渲染在模型芯片之前，`order` 经 `display: contents` 锚直接作用于可见盒），逐位复刻 alpha.1 的行内顺序；这两条另外限定在"同一容器里存在 dock 子元素"的前提下（`div:has(> div[class*="_dock"])`），旧宿主上根本不进样式级联，而不是仅靠"重述原生顺序"来保证无副作用。与"上下文占用按钮不显示悬停信息"的层叠：那条规则的锚点判定同样命中移植环，开关对两种呈现一并生效；同时该开关的行是**依赖行**——本项开启时面板不再渲染那一行（隐藏而非置灰，与依赖型数值字段同一规则），因为它所命名的"胶囊"已被替换并隐藏，留着只会误导；存储值不受影响，关掉本项后该行带着原值回到面板。
- **会话标题悬停稳定**（`src/client/tweaks/stable-session-title.ts`）：0.1.6-alpha.2 给会话行加了"悬停揭示"——`Rows.tsx` 的 `revealClippedTitle` 在指针落在行上时把裁剪标题元素滚到最右端（`.sessionRow .title` 经 `scroll-behavior: smooth` 平滑滑过去），并经 `@media (hover: hover)` 的 `.sessionRow:hover .title { text-overflow: clip }` 在悬停期间去掉省略号，移开时一步归零；这就是"悬停时标题会动"的来源（0.1.6-alpha.1 及之前没有这段代码，标题永远停在开头）。本调整项用一条纯 CSS 规则把标题从滚动容器变成**非滚动**的裁剪盒：`[role="treeitem"]:not([aria-expanded]) [class$="_title"] { overflow: clip !important; text-overflow: ellipsis !important }`——`overflow: clip` 的盒子不可编程滚动，宿主 JS 的 `scrollLeft` / `scrollTo` 赋值全部失效（宿主代码照常运行、只是无事可做），`text-overflow: ellipsis` 的 `!important` 在与 `.sessionRow:hover .title`（0,3,0 平级）的重要性对决中获胜，悬停时省略号保留。选择器按结构限定：会话行是工作区浏览器里**不带** `aria-expanded` 的 `role="treeitem"`（工作区行带该属性），标题是 CSS Modules 类名以 `_title` 结尾的 span（哈希形如 `<hash>_title`；行信息卡片的 `hoverTitle` 局部名不同，不会命中）。`overflow: clip` 与原生 `overflow: hidden` 布局完全一致（都是原地裁剪），不动标题的行在视觉上零变化；0.1.6-alpha.1 及更早宿主的标题本就滚动位置为 0，同一规则无任何效果。

- **隐藏会话悬停按钮**（`src/client/tweaks/hide-session-hover-actions.ts`）：悬停会话行时行尾浮出的「归档」和「置顶」按钮不是宿主内联写的，而是工作区浏览器 `sidebar.workspaces.session.row.action` 这个插槽列表的两条注入项（`session-actions/ArchiveSession.tsx`、`PinSession.tsx`），由 `Rows.tsx` 渲染在行尾操作条 `.rowActions` **内部**——同一条里的「…」菜单按钮是宿主自己的，不属于该列表。本调整项只隐藏插槽的外层包装：宿主给每个注入项都打了 `data-slot="…"` 标记并带 `style="display: contents"`，一条 `[data-slot="sidebar.workspaces.session.row.action"] { display: none !important }` 即可盖掉那个内联样式（作者样式表里的 `!important` 优先于非重要的内联声明）。规则不限定悬停状态，所以按钮在任何时候都不出现：既不会在悬停时浮出，也不会在行菜单打开期间出现（宿主原本会把操作条保持可见；而那个菜单本身就是这两个操作的新去处，`sidebar.workspaces.session.menu.item` 里注册着「归档会话」「置顶会话」两行）。选择器只认插槽名，因此不会碰到「…」菜单按钮（它是包装层之外的兄弟节点），工作区行、搜索结果行等其他行尾单元也不挂载该插槽，行的悬停底色、信息卡片、时间与菜单按钮全部保持原样；不打 `data-slot` 标记的宿主上本项保持惰性。
- **历史分页大小**（`src/client/tweaks/history-page-size.ts`）：DSH 每次历史请求的条数是客户端参数而非宿主设置：当前 0.1.7 的冷打开与「加载更早」以 `maxMessages: 500` 请求，轮次跳转另以 `turnWindow.minMessages: 200` 设下限；宿主要求 `maxMessages` 是正的安全整数，且轮次窗口下限不得大于它。本调整项因此在浏览器侧改写出去的两条请求：unary `session/page` 的 POST body（`payload.args.request.maxMessages`）与 Gateway WebSocket 的 `session/follow` open 帧（实测 0.1.6-alpha.2 的形状是 `payload.args.request.maxMessages`，扁平写法只是兜底，别按注释反过来清理）。实现是"装一次、只改目标"：`installHistoryPageSizeTransport()` 幂等地包裹 `globalThis.fetch` 与 `WebSocket.prototype.send`（**永不卸载**——在其它插件的包装层里做反向拆解不划算），此后每次设置变更只更新共享 target，因此保存后下一次请求即生效、无需重新打补丁；开启后 `maxMessages` 会**精确等于**设置值（不再只是只升不降的下限）；插件同步把 `turnWindow.minMessages` 设置为同一个值，避免大页数仍因原生 50 条下限只加载两轮。因为设置读取可能晚于本次加载的第一帧 follow，target 在装载时先用 localStorage 种子（`dsh-style-tweaks.history-page-size`）垫上，等设置快照落地后才覆盖（快照未到就推送默认值会把种子打回未启用状态），种子与推送值都按 [50, 1000] 钳制。target 与"谁有权移动它"（单调递增的所有权序号，序号最新者持有）放在 globalThis 上的单一共享对象里：包装层因此整页只装一次，新旧实例读的是同一份 target（旧层再包一层也只是写入同一精确值，因此保持幂等），插件卸载（停用 / 热重载）时只有仍持有所有权的实例能把 target 归零，迟到的 teardown 不会清掉新实例的设置。两条边界：设置读取若始终不落地（路由不可用 / 文档非法），种子会驱动整个页面生命周期，此时"关闭主开关即原生"在该页面内不成立（放大范围仍被 [50, 1000] 钳住）；改写只认 unary `session/page` 与 `session/follow` 的 open 帧，宿主若换传输通道会静默失效。面板侧：主开关关闭时下方两行隐藏（存储值保留），「打开会话时同样生效」在主开关开启时始终显示（即使条数低于 DSH 原生值，它仍会改变首屏请求），清空输入框、或输入小于 50 的值，都不会静默提交最小值。

## 致谢

本插件的灵感来自并参考了 [wlj521/dsh-ui-tweaks](https://github.com/wlj521/dsh-ui-tweaks)——一个更全面的 DSH UI 个性化插件，覆盖字体、表格、时间线、Git 等更多维度。如果本插件的功能不够用，欢迎前往看看。

## 协议

MIT
