import Hls from 'hls.js';
import { Panel } from './Panel';
import { fetchLiveVideoId } from '@/services/live-news';

// YouTube IFrame Player API types
type YouTubePlayer = {
  mute(): void;
  unMute(): void;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  destroy(): void;
};

type YouTubePlayerConstructor = new (
  elementId: string | HTMLElement,
  options: {
    videoId: string;
    playerVars: Record<string, number | string>;
    events: { onReady: () => void };
  },
) => YouTubePlayer;

type YouTubeNamespace = { Player: YouTubePlayerConstructor };

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ─── Channel Definitions ───────────────────────────────────────────────────────

interface BaseChannel {
  id: string;
  name: string;
}

interface YouTubeChannel extends BaseChannel {
  type: 'youtube';
  handle: string;                // e.g. @AlJazeeraEnglish
  fallbackVideoId: string;       // Always-live video ID fallback
  videoId?: string;              // Dynamically resolved
  isLive?: boolean;
}

interface HlsChannel extends BaseChannel {
  type: 'hls';
  streamUrl: string;             // Primary m3u8 stream URL (or fallback)
  fallbackUrls?: string[];       // Additional fallback URLs to try
  dynamicUrlEndpoint?: string;   // Optional: fetch fresh URL from this /api/ endpoint first
}

type LiveChannel = YouTubeChannel | HlsChannel;

// ─── Channel List ──────────────────────────────────────────────────────────────

const LIVE_CHANNELS: LiveChannel[] = [
  // Al Jazeera Arabic
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    type: 'youtube',
    handle: '@aljazeera',
    fallbackVideoId: 'bNyUyrR0PHo',
  },
  // Al Jazeera Mubasher (Arabic live) – YouTube
  {
    id: 'aljazeera-mubasher',
    name: 'AJ Mubasher',
    type: 'youtube',
    handle: '@aljazeeramubasher',
    fallbackVideoId: 'hvONmH0Yx74',
  },
  // Al Mayadin – YouTube
  {
    id: 'almayadin',
    name: 'Al Mayadin',
    type: 'youtube',
    handle: '@AlMayadeen',
    fallbackVideoId: 'rI7pYaLknak',
  },
  // Al Manar – IPTV (restricted/unavailable on YouTube)
  {
    id: 'almanar',
    name: 'Al Manar',
    type: 'hls',
    streamUrl: 'https://manar.live/x.smil/tracks-v1a1/mono.m3u8',
    fallbackUrls: [
      'https://edge.fastpublish.me/live/index.m3u8',
    ],
  },
  // Al Araby TV – YouTube
  {
    id: 'alaraby',
    name: 'Al Araby',
    type: 'youtube',
    handle: '@AlArabyTv_News',
    fallbackVideoId: 'QT6n6xMPlv0',
  },
  // Al Jadeed – dynamic URL from elahmad.com (token-based), with iptv-org fallback
  {
    id: 'aljadeed',
    name: 'Al Jadeed',
    type: 'hls',
    dynamicUrlEndpoint: '/api/iptv-stream?channel=aljadeed',
    streamUrl: 'http://185.9.2.18/chid_391/mono.m3u8',
    fallbackUrls: [
      'https://samaflix.com:12103/channel7/tracks-v2a1/mono.m3u8',
    ],
  },
  // MTV Lebanon – IPTV (iptv-org Lebanon list, 1080p)
  {
    id: 'mtvlb',
    name: 'MTV Lebanon',
    type: 'hls',
    streamUrl: 'https://shls-live-enc.edgenextcdn.net/out/v1/45ad6fbe1f7149ad9f05f8aefc38f6c0/index.m3u8',
    fallbackUrls: [
      'https://hms.pfs.gdn/v1/broadcast/mtv/playlist.m3u8',
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export class LiveNewsPanel extends Panel {
  private static ytApiPromise: Promise<void> | null = null;

  // Active channel state
  private activeChannel: LiveChannel = LIVE_CHANNELS[0]!;
  private channelSwitcher: HTMLElement | null = null;
  private isMuted = true;
  private isPlaying = true;
  private wasPlayingBeforeIdle = true;
  private muteBtn: HTMLButtonElement | null = null;
  private liveBtn: HTMLButtonElement | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly IDLE_PAUSE_MS = 5 * 60 * 1000;
  private boundVisibilityHandler!: () => void;
  private boundIdleResetHandler!: () => void;

  // YouTube player state
  private ytPlayer: YouTubePlayer | null = null;
  private ytPlayerContainer: HTMLDivElement | null = null;
  private ytPlayerElement: HTMLDivElement | null = null;
  private ytPlayerElementId: string;
  private ytPlayerReady = false;
  private ytCurrentVideoId: string | null = null;

  // HLS player state
  private hlsInstance: Hls | null = null;
  private hlsVideo: HTMLVideoElement | null = null;

  constructor() {
    super({ id: 'live-news', title: 'Live News', showCount: false, trackActivity: false });
    this.ytPlayerElementId = `live-news-player-${Date.now()}`;
    this.element.classList.add('panel-wide');
    this.createLiveButton();
    this.createMuteButton();
    this.createChannelSwitcher();
    void this.renderActiveChannel();
    this.setupIdleDetection();
  }

  // ─── Idle detection ─────────────────────────────────────────────────────────

  private setupIdleDetection(): void {
    this.boundVisibilityHandler = () => {
      if (document.hidden) {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
      } else {
        this.resumeFromIdle();
        this.boundIdleResetHandler();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    this.boundIdleResetHandler = () => {
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      this.idleTimeout = setTimeout(() => this.pauseForIdle(), this.IDLE_PAUSE_MS);
    };
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(e => {
      document.addEventListener(e, this.boundIdleResetHandler, { passive: true });
    });
    this.boundIdleResetHandler();
  }

  private pauseForIdle(): void {
    if (this.isPlaying) { this.wasPlayingBeforeIdle = true; this.isPlaying = false; this.updateLiveIndicator(); }
    this.destroyPlayers();
  }

  private resumeFromIdle(): void {
    if (this.wasPlayingBeforeIdle && !this.isPlaying) {
      this.isPlaying = true;
      this.updateLiveIndicator();
      void this.renderActiveChannel();
    }
  }

  // ─── Header controls ────────────────────────────────────────────────────────

  private createLiveButton(): void {
    this.liveBtn = document.createElement('button');
    this.liveBtn.className = 'live-indicator-btn';
    this.liveBtn.title = 'Toggle playback';
    this.updateLiveIndicator();
    this.liveBtn.addEventListener('click', e => { e.stopPropagation(); this.togglePlayback(); });
    this.element.querySelector('.panel-header')?.appendChild(this.liveBtn);
  }

  private updateLiveIndicator(): void {
    if (!this.liveBtn) return;
    this.liveBtn.innerHTML = this.isPlaying
      ? '<span class="live-dot"></span>Live'
      : '<span class="live-dot paused"></span>Paused';
    this.liveBtn.classList.toggle('paused', !this.isPlaying);
  }

  private togglePlayback(): void {
    this.isPlaying = !this.isPlaying;
    this.wasPlayingBeforeIdle = this.isPlaying;
    this.updateLiveIndicator();
    if (this.activeChannel.type === 'youtube') {
      this.syncYtPlayerState();
    } else {
      if (this.hlsVideo) {
        if (this.isPlaying) void this.hlsVideo.play();
        else this.hlsVideo.pause();
      }
    }
  }

  private createMuteButton(): void {
    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'live-mute-btn';
    this.muteBtn.title = 'Toggle sound';
    this.updateMuteIcon();
    this.muteBtn.addEventListener('click', e => { e.stopPropagation(); this.toggleMute(); });
    this.element.querySelector('.panel-header')?.appendChild(this.muteBtn);
  }

  private updateMuteIcon(): void {
    if (!this.muteBtn) return;
    this.muteBtn.innerHTML = this.isMuted
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    this.muteBtn.classList.toggle('unmuted', !this.isMuted);
  }

  private toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.updateMuteIcon();
    if (this.activeChannel.type === 'youtube') {
      this.syncYtPlayerState();
    } else if (this.hlsVideo) {
      this.hlsVideo.muted = this.isMuted;
    }
  }

  // ─── Channel switcher ───────────────────────────────────────────────────────

  private createChannelSwitcher(): void {
    this.channelSwitcher = document.createElement('div');
    this.channelSwitcher.className = 'live-news-switcher';

    LIVE_CHANNELS.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = `live-channel-btn ${ch.id === this.activeChannel.id ? 'active' : ''}`;
      btn.dataset.channelId = ch.id;
      // Show player type badge
      const badge = ch.type === 'hls' ? ' 📡' : '';
      btn.textContent = ch.name + badge;
      btn.addEventListener('click', () => void this.switchChannel(ch));
      this.channelSwitcher!.appendChild(btn);
    });

    this.element.insertBefore(this.channelSwitcher, this.content);
  }

  private setChannelButtonState(channelId: string, state: 'loading' | 'ready' | 'offline'): void {
    this.channelSwitcher?.querySelectorAll('.live-channel-btn').forEach(btn => {
      const el = btn as HTMLElement;
      if (el.dataset.channelId !== channelId) return;
      el.classList.remove('loading', 'offline');
      if (state === 'loading') el.classList.add('loading');
      if (state === 'offline') el.classList.add('offline');
    });
  }

  private async switchChannel(ch: LiveChannel): Promise<void> {
    if (ch.id === this.activeChannel.id) return;

    this.activeChannel = ch;

    // Update active button
    this.channelSwitcher?.querySelectorAll('.live-channel-btn').forEach(btn => {
      const el = btn as HTMLElement;
      el.classList.toggle('active', el.dataset.channelId === ch.id);
    });
    this.setChannelButtonState(ch.id, 'loading');

    this.destroyPlayers();
    await this.renderActiveChannel();
  }

  // ─── Player orchestration ───────────────────────────────────────────────────

  private async renderActiveChannel(): Promise<void> {
    const ch = this.activeChannel;
    if (ch.type === 'youtube') {
      await this.renderYouTubePlayer(ch);
    } else {
      await this.renderHlsPlayer(ch);
    }
  }

  // ─── YouTube player ─────────────────────────────────────────────────────────

  private ensureYtContainer(): void {
    if (this.ytPlayerContainer && this.ytPlayerElement) return;
    this.content.innerHTML = '';
    this.ytPlayerContainer = document.createElement('div');
    this.ytPlayerContainer.className = 'live-news-player';
    this.ytPlayerElement = document.createElement('div');
    this.ytPlayerElement.id = this.ytPlayerElementId;
    this.ytPlayerContainer.appendChild(this.ytPlayerElement);
    this.content.appendChild(this.ytPlayerContainer);
  }

  private static loadYtApi(): Promise<void> {
    if (LiveNewsPanel.ytApiPromise) return LiveNewsPanel.ytApiPromise;
    LiveNewsPanel.ytApiPromise = new Promise((resolve, reject) => {
      if (window.YT?.Player) { resolve(); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      if (document.querySelector('script[data-yt-api]')) return;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.dataset.ytApi = 'true';
      s.onerror = () => reject(new Error('YouTube API load failed'));
      document.head.appendChild(s);
    });
    return LiveNewsPanel.ytApiPromise;
  }

  private async renderYouTubePlayer(ch: YouTubeChannel): Promise<void> {
    // Resolve live video ID
    const liveId = await fetchLiveVideoId(ch.handle).catch(() => null);
    ch.videoId = liveId || ch.fallbackVideoId;
    ch.isLive = !!liveId;

    if (!ch.videoId) {
      this.showOfflineMessage(ch.name);
      this.setChannelButtonState(ch.id, 'offline');
      return;
    }

    this.ensureYtContainer();
    await LiveNewsPanel.loadYtApi();
    if (this.ytPlayer || !this.ytPlayerElement) return;

    this.ytPlayer = new window.YT!.Player(this.ytPlayerElement, {
      videoId: ch.videoId,
      playerVars: {
        autoplay: this.isPlaying ? 1 : 0,
        mute: this.isMuted ? 1 : 0,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
        enablejsapi: 1,
      },
      events: {
        onReady: () => {
          this.ytPlayerReady = true;
          this.ytCurrentVideoId = ch.videoId || null;
          this.syncYtPlayerState();
          this.setChannelButtonState(ch.id, 'ready');
        },
      },
    });
  }

  private syncYtPlayerState(): void {
    if (!this.ytPlayer || !this.ytPlayerReady) return;
    const ch = this.activeChannel as YouTubeChannel;
    const videoId = ch.videoId;
    if (!videoId) return;

    if (this.ytCurrentVideoId !== videoId) {
      this.ytCurrentVideoId = videoId;
      if (!this.ytPlayerElement || !document.getElementById(this.ytPlayerElementId)) {
        this.ensureYtContainer();
        void this.renderYouTubePlayer(ch);
        return;
      }
      if (this.isPlaying) this.ytPlayer.loadVideoById(videoId);
      else this.ytPlayer.cueVideoById(videoId);
    }
    if (this.isMuted) this.ytPlayer.mute(); else this.ytPlayer.unMute();
    if (this.isPlaying) this.ytPlayer.playVideo(); else this.ytPlayer.pauseVideo();
  }

  // ─── HLS player ─────────────────────────────────────────────────────────────

  private async renderHlsPlayer(ch: HlsChannel): Promise<void> {
    this.content.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'live-news-player';

    const video = document.createElement('video');
    video.className = 'live-hls-video';
    video.muted = this.isMuted;
    video.autoplay = this.isPlaying;
    video.playsInline = true;
    video.controls = false;
    container.appendChild(video);
    this.content.appendChild(container);
    this.hlsVideo = video;

    // Build URL list: try dynamic (fresh token) URL first, then static fallbacks
    const urls: string[] = [];
    if (ch.dynamicUrlEndpoint) {
      try {
        const resp = await fetch(ch.dynamicUrlEndpoint);
        const data = await resp.json() as { streamUrl?: string };
        if (data.streamUrl) urls.push(data.streamUrl);
      } catch { /* dynamic fetch failed, proceed with static URLs */ }
    }
    urls.push(ch.streamUrl, ...(ch.fallbackUrls ?? []));

    const loaded = await this.tryHlsUrls(video, urls);

    if (!loaded) {
      this.showOfflineMessage(ch.name);
      this.setChannelButtonState(ch.id, 'offline');
      return;
    }

    this.setChannelButtonState(ch.id, 'ready');
    if (this.isPlaying) video.play().catch(() => {/* autoplay blocked */ });
  }


  private tryHlsUrls(video: HTMLVideoElement, urls: string[]): Promise<boolean> {
    return new Promise(resolve => {
      let idx = 0;

      const tryNext = (): void => {
        if (idx >= urls.length) { resolve(false); return; }
        const url = urls[idx++]!;

        // Destroy previous HLS instance
        if (this.hlsInstance) { this.hlsInstance.destroy(); this.hlsInstance = null; }

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          this.hlsInstance = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => resolve(true));
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) { hls.destroy(); tryNext(); }
          });

          hls.loadSource(url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = url;
          video.addEventListener('loadedmetadata', () => resolve(true), { once: true });
          video.addEventListener('error', () => tryNext(), { once: true });
        } else {
          resolve(false);
        }
      };

      tryNext();
    });
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private showOfflineMessage(name: string): void {
    this.content.innerHTML = `
      <div class="live-offline">
        <div class="offline-icon">📡</div>
        <div class="offline-text">${name} is currently unavailable</div>
        <button class="offline-retry" onclick="this.closest('[data-panel=live-news]')?.dispatchEvent(new CustomEvent('retry'))">Retry</button>
      </div>
    `;
  }

  private destroyPlayers(): void {
    // YouTube
    if (this.ytPlayer) { this.ytPlayer.destroy(); this.ytPlayer = null; }
    this.ytPlayerReady = false;
    this.ytCurrentVideoId = null;
    this.ytPlayerContainer = null;
    this.ytPlayerElement = null;

    // HLS
    if (this.hlsInstance) { this.hlsInstance.destroy(); this.hlsInstance = null; }
    if (this.hlsVideo) { this.hlsVideo.pause(); this.hlsVideo.src = ''; this.hlsVideo = null; }

    this.content.innerHTML = '';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  public refresh(): void {
    if (this.activeChannel.type === 'youtube') this.syncYtPlayerState();
  }

  public destroy(): void {
    if (this.idleTimeout) { clearTimeout(this.idleTimeout); this.idleTimeout = null; }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(e => {
      document.removeEventListener(e, this.boundIdleResetHandler);
    });
    this.destroyPlayers();
    super.destroy();
  }
}
