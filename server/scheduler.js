/**
 * 节律调度器
 * 根据用户作息自动触发 DJ 播报
 */
class Scheduler {
  constructor(router, db) {
    this.router = router;
    this.db = db;
    this.jobs = [];
    this.running = false;
  }

  /**
   * 启动调度器
   */
  start() {
    this.running = true;
    console.log('[Scheduler] 调度器已启动');

    // 早间播报 08:00
    this.scheduleDaily(8, 0, 'morning', '早安~新的一天开始了，给我一个好心情的开始吧。推荐2首歌。');

    // 午间推荐 12:30
    this.scheduleDaily(12, 30, 'noon', '午休时间，来点轻松的音乐吧。推荐2-3首歌。');

    // 下午提神 15:00
    this.scheduleDaily(15, 0, 'afternoon', '下午有点困了，来点有节奏感的歌提提神。推荐2-3首歌。');

    // 傍晚放松 18:30
    this.scheduleDaily(18, 30, 'evening', '下班了，辛苦了，来点放松的音乐。推荐2-3首歌。');

    // 深夜电台 23:00
    this.scheduleDaily(23, 0, 'night', '夜深了，今天辛苦了，来点舒缓的音乐陪伴入睡。推荐3首歌，排成一个小歌单。');

    // 每分钟检查一次
    this.interval = setInterval(() => this.tick(), 60000);
  }

  /**
   * 停止调度器
   */
  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[Scheduler] 调度器已停止');
  }

  /**
   * 注册每日定时任务
   */
  scheduleDaily(hour, minute, id, message) {
    this.jobs.push({ hour, minute, id, message, fired: false });
  }

  /**
   * 每分钟检查
   */
  tick() {
    if (!this.running) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (const job of this.jobs) {
      if (job.hour === currentHour && job.minute === currentMinute && !job.fired) {
        job.fired = true;
        console.log(`[Scheduler] 触发定时任务: ${job.id}`);

        // 检查是否启用自动播报
        const autoPlay = this.db.getPref('auto_broadcast', true);
        if (autoPlay) {
          this.router.handleAutoMessage(job.message).catch(err => {
            console.error(`[Scheduler] 任务执行失败 ${job.id}:`, err);
          });
        }
      }

      // 重置标记（过了这个时间点后）
      if (job.hour !== currentHour || job.minute !== currentMinute) {
        job.fired = false;
      }
    }
  }

  /**
   * 获取所有定时任务状态
   */
  getJobs() {
    return this.jobs.map(j => ({
      id: j.id,
      time: `${String(j.hour).padStart(2, '0')}:${String(j.minute).padStart(2, '0')}`,
      message: j.message,
      fired: j.fired
    }));
  }
}

module.exports = Scheduler;
