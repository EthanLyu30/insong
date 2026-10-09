# 虚构样例相册

2026-10-02。仅用于系统演示记忆，不代表用户上传、艺人实演或到场记录。

- concert / journey / festival：本次使用内置 imagegen 新生成，JPEG 适配最长 1600px；网页封面使用同源 WebP。
- arrival：既有虚拟夕阳晶体场馆的相册尺寸版本。
- indoor：既有广州室内场馆虚拟灯海的相册尺寸版本。
- 每张样例包含 2–3 张不同图片，依照正常 Photo 归属与公开快照访问控制保存。
- 迁移只更新未修改且仍公开的系统样例；用户照片、撤回的故事、删除记录不受影响。

## 用户提供的演出配图（2026-10-08）

`user-gem-01.jpg` 至 `user-gem-05.jpg` 为用户提供的邓紫棋演出照片；
`user-liu-01.jpg` 至 `user-liu-05.jpg` 为用户提供的刘雨昕演出照片。文件保持原样，
仅用于本项目虚构样例的演出氛围配图，不能作为故事作者到场、具体场次、拍摄时间或
曲目演出的证明。拍摄者和原始发布链接尚未核实；公开发布、商用或向赛事平台提交前，
应确认相应使用授权与署名要求。照片中原有的标识和水印未移除。

新的一次性迁移 `user-concert-sample-photos-v1` 只替换仍公开、未编辑，且仍在使用
原始生成相册的邓紫棋和刘雨昕虚构样例。既有照片保留在数据库中，不删除用户数据。

## 刘雨昕深圳演出补充瞬间（2026-10-09）

`user-liu-moment-01.jpg` 至 `user-liu-moment-04.jpg` 来自用户本次提供的现场照片。
其中另一张附件与 `user-liu-moment-01.jpg` 内容完全相同，未重复入库；用户的私人
观演感想截图仅作为演示文案的情绪参考，没有作为图片或原文发布。新增的 4 张卡片
使用虚构署名和原创文案，并继续显示“虚构样例”；不声称虚构作者拍摄或到场。
已收录的 QQ 音乐歌手资料图只作为歌手资料，不作为这场演出的现场照片。

## “我的记忆”演示卡片补充配图（2026-10-09）

`user-tnt-01.jpg` 至 `user-tnt-03.jpg`、`user-gem-personal-01.jpg` 至
`user-gem-personal-05.jpg`、`user-phoenix-01.jpg` 至 `user-phoenix-04.jpg`
为用户提供的时代少年团、邓紫棋、凤凰传奇相关照片。附件中另一张白衣短发舞台照
与此前收录的 `user-liu-moment-04.jpg` 完全相同，属于刘雨昕素材，没有误放入
时代少年团相册。

一次性迁移 `personal-concert-sample-refresh-v1` 只替换“小林”名下六张仍保持原始
标题、文案和相册的私密虚构样例；编辑过、删除过、非演示身份的卡片均不改动，
旧照片也不删除。文案是创作，照片只作相关艺人的演出氛围配图，不能证明虚构作者
到场、具体场次、日期、地点或曲目。素材原始版权和署名尚未核实，公开发布或商用前
应确认授权，且不得移除原有水印。

## 新增个人样例与刘雨昕上海案例（2026-10-09）

用户确认附件按时代少年团、邓紫棋、凤凰传奇、薛之谦、毛不易、华晨宇分组。
新增 `user-xue-01.jpg` 至 `user-xue-07.jpg` 对应附件 13–19；
`user-mao-01.jpg` 至 `user-mao-04.jpg` 对应附件 20–23；
`user-hua-01.jpg` 至 `user-hua-02.jpg` 对应附件 24–25。文件原样复制，保留原有水印。

一次性增量 `concert-demo-memories-v1` 新增“小林”的四条私密样例：刘雨昕上海、
薛之谦深圳，以及未指定日期/场馆的毛不易、华晨宇现场记忆。后两位未在演出目录中，
不添加虚构官宣或场次。刘雨昕上海另有 12 条不同虚构署名的公开记忆，使用已有
刘雨昕配图和原创文字。照片不证明具体场次、日期、地点、曲目或虚构作者的到场经历。
不覆盖已有个人记录，不恢复删除或撤回的样例，不向真实账号添加记录。
上述照片仅在本项目演示使用；对外发布前需确认版权授权和署名要求。

## 本次生成提示词

### concert

Use case: photorealistic-natural. Asset type: music memory card illustration for a fictional concert, vertical 3:4 photograph. Contemporary 2026 Chinese outdoor stadium concert, audience-eye view from lower stands, glowing warm amber lightsticks across the foreground, distant elegant stage with blue-white light beams and a dark cobalt twilight sky. Credible candid concert photography, high-end editorial detail, balanced highlights, naturally sharp crowd silhouettes and stadium structure, warm human feeling. No identifiable artist, no face closeups, no logos, no text, no watermark. This is a fictional atmosphere scene, not a specific artist or documented event. Make one full-bleed image.

### journey

Use case: photorealistic-natural. Asset type: fictional music memory travel photograph, vertical 3:4. Contemporary Chinese high-speed train at golden hour, candid seat-level view of a window overlooking quiet green landscape and a modern city receding in the distance, warm sunset brushing the pale table, simple wired earphones and folded unbranded paper ticket placed naturally on the table. Understated intimate photography, realistic materials, crisp train details and soft distant motion, generous calm composition, warm cream and honey tones. No readable text, no logos, no watermark, no people. One full-bleed image.

### festival

Use case: photorealistic-natural. Asset type: fictional music festival memory photograph, vertical 3:4. Contemporary outdoor music festival on a broad green lawn at late golden hour, candid eye-level view, two young adult friends sitting on a picnic blanket seen from behind, a stylish distant stage, softly lit clouds, scattered groups enjoying music. Natural fresh greens, golden light, honest photographic texture, detailed but relaxed, gentle human warmth, no oversaturation, no heavy blur. No identifiable faces, no text, no logos, no watermark. Fictional festival rather than any documented artist or event. One full-bleed image.
