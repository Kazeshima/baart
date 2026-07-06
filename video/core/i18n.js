const TEXT = {
  zh: {
    studio: "视频工作室", back: "返回评级工具", empty: "请先在 BAART 中创建评级，或导入评级 JSON。",
    noStudent: "无学生", students: "名学生", project: "项目", output: "输出", presentation: "显示",
    timing: "时间", effects: "效果", order: "顺序", importJson: "导入 JSON", saveProject: "保存项目",
    preset: "分辨率", format: "格式", filename: "文件名", pngSequence: "PNG 图片序列", outputLocation: "保存位置",
    chooseOutput: "选择", notSelected: "未选择（渲染时询问）", developmentOutput: "开发服务器默认输出目录", theme: "主题", night: "夜间", day: "日间",
    uiLanguage: "界面语言", dataLanguage: "学生数据", terrain: "地形", arenaSeason: "竞技场赛季",
    portraitOpacity: "立绘透明度", studentDuration: "单个学生时长（秒）", fadeIn: "淡入（秒）",
    fadeOut: "淡出（秒）", infoStagger: "信息块间隔（秒）", radarScanDuration: "雷达扫描时长（秒）",
    radarPointDuration: "数据点展开时长（秒）", radarPolygonDuration: "多边形展开时长（秒）",
    overallReveal: "综合评级显示（秒）",
    scanIntensity: "扫描亮度", rippleCount: "波纹数量", rippleDuration: "波纹时长（秒）",
    rippleScale: "波纹范围", rippleOpacity: "波纹透明度", commentDelay: "评论滚动延迟（秒）",
    commentSpeed: "评论滚动速度（像素/秒）", sort: "排序", direction: "方向",
    chronological: "评级时间", overallScore: "综合分", studentId: "学生 ID", school: "学校分组", manual: "手动排序",
    ascending: "正序", descending: "倒序", renderMp4: "渲染 MP4", renderPng: "渲染 PNG 帧",
    cancel: "取消", importFailed: "导入失败", renderUnavailable: "渲染服务不可用。浏览器开发模式请运行 npm run video:preview。",
    queued: "等待中", preparing: "准备浏览器", rendering: "渲染中", encoding: "编码中", complete: "完成", cancelled: "已取消", error: "失败",
    snapshot: "项目快照", localRatings: "本地评级", source: "数据来源", browserDownload: "下载渲染浏览器",
    Street: "街区", Outdoor: "野外", Indoor: "室内",
  },
  en: {
    studio: "Video Studio", back: "Back to Rating Tool", empty: "Create ratings in BAART or import a ratings JSON file.",
    noStudent: "No student", students: "students", project: "Project", output: "Output", presentation: "Presentation",
    timing: "Timing", effects: "Effects", order: "Order", importJson: "Import JSON", saveProject: "Save Project",
    preset: "Preset", format: "Format", filename: "Filename", pngSequence: "PNG sequence", outputLocation: "Save location",
    chooseOutput: "Choose", notSelected: "Not selected (ask when rendering)", developmentOutput: "Development server output folder", theme: "Theme", night: "Night", day: "Day",
    uiLanguage: "UI language", dataLanguage: "Student data", terrain: "Terrain", arenaSeason: "Arena season",
    portraitOpacity: "Portrait opacity", studentDuration: "Student duration (s)", fadeIn: "Fade in (s)",
    fadeOut: "Fade out (s)", infoStagger: "Info stagger (s)", radarScanDuration: "Radar scan duration (s)",
    radarPointDuration: "Point deployment (s)", radarPolygonDuration: "Polygon reveal (s)",
    overallReveal: "Overall reveal (s)",
    scanIntensity: "Scan intensity", rippleCount: "Ripple count", rippleDuration: "Ripple duration (s)",
    rippleScale: "Ripple scale", rippleOpacity: "Ripple opacity", commentDelay: "Comment delay (s)",
    commentSpeed: "Comment speed (px/s)", sort: "Sort", direction: "Direction",
    chronological: "Chronological", overallScore: "Overall score", studentId: "Student ID", school: "School", manual: "Manual",
    ascending: "Ascending", descending: "Descending", renderMp4: "Render MP4", renderPng: "Render PNG Frames",
    cancel: "Cancel", importFailed: "Import failed", renderUnavailable: "Render service is unavailable. In browser development, start npm run video:preview.",
    queued: "Queued", preparing: "Preparing browser", rendering: "Rendering", encoding: "Encoding", complete: "Complete", cancelled: "Cancelled", error: "Error",
    snapshot: "Project snapshot", localRatings: "Local ratings", source: "Source", browserDownload: "Downloading render browser",
    Street: "Urban", Outdoor: "Outdoor", Indoor: "Indoor",
  },
};

export function vt(language, key) {
  const locale = language === "en" ? "en" : "zh";
  return TEXT[locale][key] || TEXT.en[key] || key;
}
