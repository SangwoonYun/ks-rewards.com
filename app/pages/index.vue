<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar-inner">
        <a href="/" class="brand">
          <BrandMark />
          <span class="brand-name">Kingshot Rewards</span>
        </a>
        <a href="https://ks-giftcode.centurygame.com" class="topbar-link" target="_blank" rel="noopener noreferrer">
          Gift Codes
          <svg class="topbar-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
        </a>
      </div>
    </header>

    <main class="main">
      <section class="hero">
        <div class="hero-text">
          <h1 class="hero-title">Kingshot Rewards <span class="hero-sub">자동 기프트 코드 수령</span></h1>
          <p class="hero-lead">플레이어 ID를 한 번만 등록하면, 새 기프트 코드가 나올 때마다 자동으로 수령합니다.</p>
        </div>
        <div v-if="siteStats" class="hero-stats">
          <div class="stat-tile">
            <div class="stat-label">등록 유저</div>
            <div class="stat-value">{{ siteStats.totalUsers.toLocaleString() }}</div>
            <div class="stat-detail"><span class="stat-dot is-active" />활성 {{ siteStats.activeUsers.toLocaleString() }}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">수령 대기열</div>
            <div class="stat-value">{{ siteStats.pendingQueueItems.toLocaleString() }}</div>
            <div class="stat-detail">
              <span :class="['stat-dot', siteStats.pendingQueueItems > 0 ? 'is-busy' : 'is-active']" />
              {{ siteStats.pendingQueueItems > 0 ? '처리 중' : '대기 없음' }}
            </div>
          </div>
        </div>
      </section>

      <section class="card register" aria-labelledby="register-title">
        <h2 id="register-title" class="card-title">자동 수령 등록</h2>
        <div class="register-fields">
          <div class="field field-player">
            <label for="playerId">플레이어 ID</label>
            <input
              id="playerId"
              v-model="playerInput"
              type="text"
              placeholder="쉼표로 구분하여 여러 플레이어 ID 입력 (예: 12345678, 23456789)"
              @keyup.enter="registerPlayer"
            />
          </div>

          <div class="field field-server">
            <label for="serverId">왕국 번호</label>
            <input
              id="serverId"
              v-model="serverInput"
              type="text"
              inputmode="numeric"
              placeholder="예: 120 (위 플레이어 ID 전체에 동일하게 적용됩니다)"
              @keyup.enter="registerPlayer"
            />
          </div>

          <button
            id="startBtn"
            class="register-btn"
            :disabled="isRegistering"
            @click="registerPlayer"
          >
            <span v-if="isRegistering" class="spinner" aria-hidden="true"></span>
            {{ isRegistering ? '등록 중...' : '자동 수령 등록' }}
          </button>
        </div>

        <div id="status" v-if="statusMessage" :class="['status', statusType]" role="status">{{ statusMessage }}</div>
      </section>

      <section class="live">
        <div id="codes-panel" class="card panel">
          <div class="panel-head">
            <h2 class="card-title">Gift Codes</h2>
            <span class="count-pill">{{ displayedCodes.length }}</span>
          </div>
          <div id="codes" :class="['codes-grid', { 'is-empty': displayedCodes.length === 0 }]">
            <template v-if="displayedCodes.length > 0">
              <div v-for="code in displayedCodes" :key="code.code" :class="['code-tile', { expired: code.validation_status === 'expired' }]">
                <span class="code-tile-code">{{ code.code }}</span>
                <span :class="['code-tile-status', code.validation_status === 'expired' ? 'expired' : 'active']">
                  {{ code.validation_status === 'expired' ? '만료됨' : '사용 가능' }}
                </span>
              </div>
            </template>
            <template v-else>
              <div class="empty-message">등록된 코드가 없습니다.</div>
            </template>
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head">
            <h2 class="card-title">최근 수령 내역</h2>
            <span class="live-badge"><span class="live-dot" aria-hidden="true"></span>LIVE</span>
          </div>
          <div id="redemptions" :class="['redemptions-list', { 'is-empty': redemptions.length === 0 }]">
            <template v-if="redemptions.length > 0">
              <div
                v-for="redemption in redemptions"
                :key="redemption.id"
                class="redemption-row"
              >
                <UserAvatar
                  :src="redemption.avatar_url"
                  :alt="`${redemption.nickname || 'Player'} avatar`"
                  class="redemption-avatar"
                />

                <div class="redemption-info">
                  <div class="redemption-player">
                    <span class="redemption-nickname">{{ redemption.nickname || 'Player' }}</span>
                    <span v-if="redemption.kingdom" class="redemption-kingdom">(#{{ redemption.kingdom }})</span>
                  </div>
                  <span class="redemption-time">{{ formatKST(redemption.redeemed_at) }} KST</span>
                </div>
                <span class="redemption-code">{{ redemption.code }}</span>
              </div>
            </template>
            <template v-else>
              <div class="empty-message">아직 수령 기록이 없습니다.</div>
            </template>
          </div>
        </div>
      </section>

      <section class="card info">
        <h2 class="card-title">About</h2>
        <dl class="info-list">
          <div class="info-item">
            <dt>기능</dt>
            <dd>Kingshot 기프트 코드를 자동으로 감지하여 등록된 플레이어 ID로 즉시 수령합니다.</dd>
          </div>
          <div class="info-item">
            <dt>등록 방법</dt>
            <dd>플레이어 ID를 입력 후 등록 버튼을 누르세요. 이후 사이트를 닫아도 계속 자동 수령됩니다.</dd>
          </div>
          <div class="info-item">
            <dt>플레이어 ID 확인</dt>
            <dd>게임 실행 → 프로필 → 정보 탭에서 이름 아래 표시됩니다.</dd>
          </div>
          <div class="info-item">
            <dt>왕국 번호</dt>
            <dd>한 번에 입력한 왕국 번호는 위에 입력한 모든 플레이어 ID에 동일하게 적용됩니다. 왕국이 다른 플레이어는 나눠서 등록해 주세요.</dd>
          </div>
        </dl>

        <div class="notices">
          <p class="notice-text"><strong>안내:</strong> 닉네임/아바타는 외부 공개 정보를 바탕으로 표시되어, 반영이 늦거나 표시되지 않을 수 있습니다.</p>
          <p class="notice-text"><strong>이민하신 경우:</strong> 이민(왕국 이동)을 하신 경우, 같은 플레이어 ID와 새 왕국 번호로 다시 등록하시면 왕국 정보가 자동으로 갱신됩니다.</p>
          <p class="notice-text"><strong>장기 미접속 시:</strong> 오랫동안(90일 이상) 게임에 접속하지 않은 플레이어는 자동으로 감지되어 수령이 중단(비활성화)됩니다. 다시 등록하시면 바로 재활성화됩니다.</p>
        </div>

        <div class="disclaimer" role="note" aria-label="Disclaimer">
          <svg class="disclaimer-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <div class="disclaimer-content">
            <div class="disclaimer-title"><strong>Disclaimer</strong></div>
            <p>Kingshot 서버의 요청 제한을 준수하기 위해 모든 등록 및 수령은 큐 기반으로 처리됩니다.</p>
            <ul>
              <li>초기 등록 및 즉시 수령은 몇 분 정도 소요될 수 있습니다.</li>
              <li>등록 인원이 많을 경우 새 코드 수령이 지연될 수 있습니다.</li>
              <li>지연이 과도해질 경우 개선 로직이 적용될 예정입니다.</li>
            </ul>
          </div>
        </div>
      </section>

      <div class="bottom-row">
        <section class="card support" aria-labelledby="support-title">
          <h2 id="support-title" class="card-title">Support</h2>
          <p>본 사이트는 후원으로 유지됩니다.</p>
          <div class="support-qrs">
            <figure class="support-qr">
              <a href="supertoss://send?amount=0&bank=IBK%EA%B8%B0%EC%97%85%EC%9D%80%ED%96%89&accountNo=29810334201018&origin=qr">
                <img src="/images/qr-toss.jpg" alt="토스뱅크 후원 QR 코드" width="128" height="128" loading="lazy">
              </a>
              <figcaption>토스뱅크</figcaption>
            </figure>
            <figure class="support-qr">
              <a href="https://www.buymeacoffee.com/swyun" target="_blank" rel="noopener noreferrer">
                <img src="/images/qr-bmc.png" alt="Buy Me a Coffee 후원 QR 코드" width="128" height="128" loading="lazy">
              </a>
              <figcaption>Buy Me a Coffee</figcaption>
            </figure>
          </div>
        </section>

        <div class="bottom-side">
          <section class="card info contact">
            <h2 class="card-title">Contact</h2>
            <p>피드백 또는 플레이어 ID 삭제 요청은 <a href="mailto:dev.swyun@gmail.com">dev.swyun@gmail.com</a>으로 연락 주세요.</p>
            <p class="contact-credit">
              <a href="https://github.com/SangwoonYun/ks-rewards.com" class="github-link" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
              </a>
              Created by #347 [KIW] 방구석개발자
            </p>
          </section>

          <nav class="policy-links" aria-label="정책">
            <a href="/privacy" class="card policy-tile">개인정보 처리방침</a>
            <a href="/terms" class="card policy-tile">이용 약관</a>
          </nav>
        </div>
      </div>
    </main>

    <footer class="footer">
      <small>Made by player <strong>adaja</strong> (Kingdom 847). Automatic redemption logic adapted from <a href="https://github.com/justncodes" target="_blank" rel="noopener noreferrer">justncodes</a>.</small>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHead } from '#imports'

// Type definitions
interface GiftCode {
  code: string;
  validation_status: string;
  date_discovered: string;
}

interface Redemption {
  id: number;
  fid: string;
  code: string;
  status: string;
  nickname?: string;
  kingdom?: string;
  avatar_url?: string;
  redeemed_at: string;
}

interface CodesResponse {
  success: boolean;
  codes?: GiftCode[];
}

interface RedemptionsResponse {
  success: boolean;
  redemptions?: Redemption[];
}

interface SiteStats {
  totalUsers: number;
  activeUsers: number;
  pendingQueueItems: number;
}

interface StatsResponse {
  success: boolean;
  stats?: SiteStats;
}

// Failures are HTTP errors (400 invalid input, 422 verification failed, 500 server error)
interface RegisterResponse {
  success: true;
  message: string;
  // Codes queued (high priority) for this player, redeemed in the background
  queuedCount: number;
  alreadyRegistered?: boolean;
  kidUpdated?: boolean;
  reactivated?: boolean;
}

// Reactive state
const statusMessage = ref('');
const statusType = ref('');
const playerInput = ref('');
const serverInput = ref('');
const isRegistering = ref(false);
const codes = ref<GiftCode[]>([]);
const redemptions = ref<Redemption[]>([]);
const siteStats = ref<SiteStats | null>(null);

// Add SEO meta tags and structured data for the homepage
useHead({
  title: 'Kingshot Rewards — 자동 기프트 코드 수령 서비스',
  meta: [
    {
      name: 'description',
      content: 'Kingshot Rewards는 Kingshot 기프트 코드를 자동으로 감지하고 등록된 플레이어 ID로 즉시 수령해주는 서비스입니다. 플레이어 ID를 등록하면 더 이상 수동으로 코드를 입력할 필요가 없습니다.'
    },
    {
      name: 'keywords',
      content: 'kingshot gift codes, kingshot codes, kingshot rewards, 자동 수령, 기프트코드, 킹샷 코드'
    },
    { name: 'robots', content: 'index,follow' },

    { property: 'og:title', content: 'Kingshot Rewards — 자동 기프트 코드 수령' },
    {
      property: 'og:description',
      content: 'Kingshot 기프트 코드를 자동으로 감지하여 등록된 플레이어 ID로 즉시 수령합니다.'
    },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://ks-rewards.com/' },
    { property: 'og:image', content: 'https://ks-rewards.com/favicon.ico' },

    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: 'Kingshot Rewards — 자동 기프트 코드 수령' },
    {
      name: 'twitter:description',
      content: 'Kingshot 기프트 코드를 자동으로 감지하고 등록된 플레이어 ID로 즉시 수령합니다.'
    }
  ],

  link: [
    { rel: 'canonical', href: 'https://ks-rewards.com/' }
  ],

  script: [
    ({
      type: 'application/ld+json',
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Kingshot Rewards",
        "url": "https://ks-rewards.com/",
        "description": "Kingshot 기프트 코드를 자동으로 감지하여 등록된 플레이어 ID로 즉시 수령해주는 서비스입니다.",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://ks-rewards.com/?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      })
    } as any),

    ({
      type: 'application/ld+json',
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Kingshot Rewards",
        "url": "https://ks-rewards.com/",
        "contactPoint": [{
          "@type": "ContactPoint",
          "email": "dev.swyun@gmail.com",
          "contactType": "고객 지원"
        }]
      })
    } as any)
  ]
})

// Filter and sort codes to show validated (active) codes first, then expired codes
const displayedCodes = computed(() => {
  return codes.value
    .filter(code =>
      code.validation_status === 'validated' || code.validation_status === 'expired'
    )
    .sort((a, b) => {
      // Active codes first, expired codes last
      if (a.validation_status === 'validated' && b.validation_status === 'expired') return -1;
      if (a.validation_status === 'expired' && b.validation_status === 'validated') return 1;
      // Within the same status, sort by date (newest first)
      return new Date(b.date_discovered).getTime() - new Date(a.date_discovered).getTime();
    });
});


// API functions
let abortController: AbortController | null = null;

async function fetchCodes() {
  // Cancel any pending request
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  try {
    const response = await $fetch<CodesResponse>('/api/codes', {
      signal: controller.signal
    });
    if (response.success) {
      codes.value = response.codes || [];
    }
  } catch (error: any) {
    // Ignore aborts (expected when we cancel requests); ofetch wraps them in a FetchError
    if (!controller.signal.aborted) {
      console.error('Error fetching codes:', error);
    }
  }
}

async function fetchRedemptions() {
  try {
    const response = await $fetch<RedemptionsResponse>('/api/codes/recent-redemptions');
    if (response.success) {
      redemptions.value = response.redemptions || [];
    }
  } catch (error: any) {
    console.error('Error fetching redemptions:', error);
  }
}

async function fetchStats() {
  try {
    const response = await $fetch<StatsResponse>('/api/stats');
    if (response.success && response.stats) {
      siteStats.value = response.stats;
    }
  } catch (error: any) {
    console.error('Error fetching stats:', error);
  }
}

async function registerPlayer() {
  const input = playerInput.value.trim();
  if (!input) {
    statusMessage.value = '플레이어 ID를 최소 1개 이상 입력해 주세요.';
    statusType.value = 'error';
    return;
  }

  // Split by comma and clean up
  const fids = input.split(',').map(f => f.trim()).filter(f => f);

  if (fids.length === 0) {
    statusMessage.value = '유효한 플레이어 ID를 최소 1개 이상 입력해 주세요.';
    statusType.value = 'error';
    return;
  }

  // Validate all are numeric
  for (const fid of fids) {
    if (!/^\d+$/.test(fid)) {
      statusMessage.value = `잘못된 플레이어 ID: ${fid}. 플레이어 ID는 숫자만 가능합니다.`;
      statusType.value = 'error';
      return;
    }
  }

  const kid = serverInput.value.trim();
  if (!kid || !/^\d+$/.test(kid)) {
    statusMessage.value = '왕국 번호를 숫자로 입력해 주세요.';
    statusType.value = 'error';
    return;
  }

  isRegistering.value = true;
  statusMessage.value = `${fids.length}개 플레이어 ID 등록 중... (최대 몇 분 소요될 수 있습니다)`;
  statusType.value = '';

  let successCount = 0;
  let failCount = 0;
  const results: string[] = [];

  try {
    for (const fid of fids) {
      try {
        const response = await $fetch<RegisterResponse>('/api/users/register', {
          method: 'POST',
          body: { fid, kid }
        });

        // Queued codes are redeemed in the background, so they show up in the recent redemptions shortly
        const queued = response.queuedCount ? `, 코드 ${response.queuedCount}개 수령 대기열에 추가됨` : '';
        let head = '등록 완료';
        if (response.alreadyRegistered) {
          if (response.reactivated) {
            head = response.kidUpdated ? '재활성화됨(왕국 번호 갱신)' : '재활성화됨';
          } else {
            head = response.kidUpdated ? '왕국 번호 갱신됨' : '이미 등록됨';
          }
        }
        results.push(`${fid}: ${head}${queued}`);
        successCount++;
      } catch (error: any) {
        // 400 (invalid input) and 422 (verification failed) carry a message for the user; anything else is an error
        const message = error.data?.message ?? error.data?.statusMessage ?? error.message ?? String(error);
        const rejected = error.statusCode === 400 || error.statusCode === 422;
        results.push(`${fid}: ${rejected ? '실패' : '오류'} - ${message}`);
        failCount++;
      }
    }

    if (successCount > 0) {
      statusType.value = 'success';
      playerInput.value = ''; // Clear input on success
      serverInput.value = '';

      // The rest shows up through polling as the queued codes are redeemed
      fetchRedemptions();

      // Show a concise summary plus the per-fid results so users see what happened
      const summary = `✅ ${successCount}명(건) 등록 완료`;
      statusMessage.value = results.length > 0 ? `${summary}: [${results.join(', ')}]` : summary;
    } else {
      statusType.value = 'error';
      statusMessage.value = results.length > 0 ? `등록 실패: [${results.join(', ')}]` : '등록에 실패했습니다.';
    }
  } catch (error: any) {
    statusMessage.value = `등록 처리 중 오류: ${error.message || String(error)}`;
    statusType.value = 'error';
  } finally {
    isRegistering.value = false;
  }
}

// Polling for updates (right away, then after each run)
const redemptionsPolling = usePolling(fetchRedemptions, 5000, { immediate: true });
// Codes less frequently
const codesPolling = usePolling(() => Promise.all([fetchCodes(), fetchStats()]), 10000, { immediate: true });

onMounted(() => {
  redemptionsPolling.start();
  codesPolling.start();
});

onUnmounted(() => {
  if (abortController) abortController.abort();
});
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

/* Top bar */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid var(--border);
}

.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1080px;
  height: 60px;
  margin: 0 auto;
  padding: 0 20px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  text-decoration: none;
}

.brand-name {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}

.topbar-link:hover {
  background: var(--surface-2);
  color: var(--text);
}

.topbar-link-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Layout */
.main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 20px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 48px 0 12px;
}

.hero-stats {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
}

.stat-tile {
  min-width: 132px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.stat-label {
  color: var(--text-3);
  font-size: 0.8125rem;
  font-weight: 500;
}

.stat-value {
  margin-top: 2px;
  color: var(--text);
  font-size: 1.625rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.stat-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 0.75rem;
}

.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.stat-dot.is-active { background: var(--success); }
.stat-dot.is-busy { background: var(--warning); }

.hero-title {
  margin: 0;
  font-size: clamp(1.75rem, 1.2rem + 2.4vw, 2.625rem);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.03em;
  color: var(--text);
  word-break: keep-all;
}

.hero-sub {
  display: block;
  margin-top: 6px;
  color: var(--text-3);
  font-size: 0.6em;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.hero-lead {
  max-width: 560px;
  margin: 14px 0 0;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--text-2);
  word-break: keep-all;
}

.card {
  padding: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xs);
}

.card-title {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}

/* Registration form */
.register {
  box-shadow: var(--shadow-sm);
}

.register .card-title {
  margin-bottom: 16px;
}

.register-fields {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-2);
}

.field input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.9375rem;
  box-shadow: var(--shadow-xs);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field input::placeholder {
  color: var(--text-4);
}

.field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--ring);
}

.register-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border: none;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background-color 0.15s ease;
}

.register-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.register-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 0.875rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.status.success {
  background: var(--success-soft);
  border-color: #bbf7d0;
  color: var(--success-text);
}

.status.error {
  background: var(--danger-soft);
  border-color: #fecaca;
  color: var(--danger-text);
}

/* Live panels */
.live {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

#codes-panel {
  scroll-margin-top: 80px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.count-pill {
  min-width: 24px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--success-text);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.live-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}

.live-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--success);
  animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
  from { transform: scale(1); opacity: 0.6; }
  to { transform: scale(2.6); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot::after,
  .spinner {
    animation: none;
  }
}

.empty-message {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-3);
  font-size: 0.875rem;
}

/* Gift codes */
.codes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  align-content: start;
  gap: 10px;
  max-height: 440px;
  overflow-y: auto;
}

.codes-grid.is-empty,
.redemptions-list.is-empty {
  display: block;
}

.code-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.code-tile:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.code-tile-code {
  font-family: var(--font-mono);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}

.code-tile-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}

.code-tile-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.code-tile-status.active {
  color: var(--success-text);
}

.code-tile-status.expired {
  color: var(--text-4);
}

.code-tile.expired {
  background: var(--surface-2);
  border-color: transparent;
}

.code-tile.expired .code-tile-code {
  color: var(--text-4);
  text-decoration: line-through;
}

.code-tile.expired:hover {
  box-shadow: none;
}

/* Recent redemptions */
.redemptions-list {
  display: flex;
  flex-direction: column;
  max-height: 440px;
  margin: 0 -8px;
  overflow-y: auto;
}

.redemption-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 10px;
}

.redemption-row + .redemption-row {
  border-top: 1px solid var(--border);
}

.redemption-row:hover {
  background: #f9fafb;
}

.redemption-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--border);
}

.redemption-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.redemption-player {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.redemption-nickname {
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.redemption-kingdom {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--text-3);
}

.redemption-time {
  font-size: 0.75rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.redemption-code {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--success-soft);
  color: var(--success-text);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* About / Contact */
.info .card-title {
  margin-bottom: 16px;
}

.info-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.info-item {
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  background: #f9fafb;
  border: 1px solid var(--border);
}

.info-item dt {
  margin-bottom: 4px;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text);
}

.info-item dd {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-2);
  word-break: keep-all;
}

.notices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.notice-text {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #fde68a;
  border-radius: 10px;
  background: var(--warning-soft);
  color: #92400e;
  font-size: 0.875rem;
  line-height: 1.6;
  word-break: keep-all;
}

.disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.disclaimer-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  fill: none;
  stroke: var(--text-3);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.disclaimer-content {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-2);
  word-break: keep-all;
}

.disclaimer-title {
  margin-bottom: 4px;
  color: var(--text);
}

.disclaimer-content p {
  margin: 0 0 6px;
}

.disclaimer-content ul {
  margin: 0;
  padding-left: 18px;
  color: var(--text-3);
}

.disclaimer-content li + li {
  margin-top: 2px;
}

.contact p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--text-2);
  word-break: keep-all;
}

.info a,
.footer a {
  color: var(--primary-text);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: var(--primary-soft-2);
  text-underline-offset: 3px;
}

.info a:hover,
.footer a:hover {
  text-decoration-color: currentColor;
}

.bottom-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 20px;
}

.bottom-side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.bottom-side .contact {
  flex: 1;
}

.policy-links {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}

.policy-tile {
  padding: 16px 20px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-2);
  text-decoration: none;
}

.policy-tile:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.contact .contact-credit {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.875rem;
  color: var(--text-3);
}

.contact .github-link {
  display: inline-flex;
  color: var(--text-2);
}

.contact .github-link:hover {
  color: var(--text);
}

.github-link svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

/* Support */
.support p {
  margin: 12px 0 16px;
  font-size: 0.9375rem;
  color: var(--text-2);
  word-break: keep-all;
}

.support-qrs {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.support-qr {
  margin: 0;
  text-align: center;
}

.support-qr img {
  display: block;
  width: 128px;
  height: 128px;
  padding: 6px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.support-qr figcaption {
  margin-top: 6px;
  font-size: 0.8125rem;
  color: var(--text-3);
}

/* Footer */
.footer {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 40px;
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.6;
}

/* Responsive */
@media (max-width: 900px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }

  .stat-tile {
    flex: 1;
  }

  .live {
    grid-template-columns: minmax(0, 1fr);
  }

  .bottom-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .register-fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .field-player {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .topbar-inner {
    height: 56px;
    padding: 0 16px;
  }

  .main {
    gap: 16px;
    padding: 0 16px;
  }

  .hero {
    padding: 28px 0 4px;
  }

  .hero-lead {
    font-size: 0.9375rem;
  }

  .card {
    padding: 18px 16px;
    border-radius: var(--radius-lg);
  }

  .register-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 16px keeps iOS from zooming into focused inputs */
  .field input {
    font-size: 16px;
  }

  .register-btn {
    width: 100%;
    height: 48px;
  }

  .codes-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    max-height: 360px;
  }

  .code-tile {
    padding: 10px 12px;
  }

  .redemptions-list {
    max-height: 400px;
  }

  .info-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .footer {
    padding: 24px 16px 32px;
    text-align: center;
  }
}
</style>
