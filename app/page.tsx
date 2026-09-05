'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Copy, MapPin, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

type Menu = {
  name: string;
  shop: string;
  price: number;
  wait: number;
  fullness: number;
  condition: number;
  walk: number;
  tag: string;
  protein: string;
};

type LunchPreferences = {
  budget?: number;
  minutes?: number;
  fullness?: number;
  schedule?: 'busy' | 'normal';
};

type RegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown;
};

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const menus: Menu[] = [
  { name: '닭가슴살 보리 비빔밥', shop: '오늘의 부엌', price: 9200, wait: 6, fullness: 4, condition: 4, walk: 4, tag: '균형식', protein: '단백질 32g' },
  { name: '두부 스테이크 샐러드', shop: '그린테이블', price: 9800, wait: 5, fullness: 3, condition: 5, walk: 6, tag: '가벼운 식사', protein: '단백질 24g' },
  { name: '순두부와 잡곡밥', shop: '소담 한식', price: 8500, wait: 8, fullness: 5, condition: 4, walk: 3, tag: '든든한 식사', protein: '단백질 27g' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sliderValue = (value: number | readonly number[]) => typeof value === 'number' ? value : value[0];

function readPreferences(input: unknown): LunchPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('입력은 객체여야 합니다.');
  const raw = input as Record<string, unknown>;
  const result: LunchPreferences = {};
  if (raw.budget !== undefined) {
    if (typeof raw.budget !== 'number') throw new Error('budget은 숫자여야 합니다.');
    result.budget = clamp(Math.round(raw.budget / 500) * 500, 7000, 15000);
  }
  if (raw.minutes !== undefined) {
    if (typeof raw.minutes !== 'number') throw new Error('minutes는 숫자여야 합니다.');
    result.minutes = clamp(Math.round(raw.minutes / 5) * 5, 15, 60);
  }
  if (raw.fullness !== undefined) {
    if (typeof raw.fullness !== 'number') throw new Error('fullness는 숫자여야 합니다.');
    result.fullness = clamp(Math.round(raw.fullness), 1, 5);
  }
  if (raw.schedule !== undefined) {
    if (raw.schedule !== 'busy' && raw.schedule !== 'normal') throw new Error('schedule은 busy 또는 normal이어야 합니다.');
    result.schedule = raw.schedule;
  }
  return result;
}

export default function Home() {
  const [budget, setBudget] = useState(10000);
  const [minutes, setMinutes] = useState(25);
  const [fullness, setFullness] = useState(4);
  const [schedule, setSchedule] = useState<'busy' | 'normal'>('busy');
  const [selectedName, setSelectedName] = useState(menus[0].name);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackFullness, setFeedbackFullness] = useState(4);
  const [feedbackCondition, setFeedbackCondition] = useState(4);
  const [inviteStatus, setInviteStatus] = useState('');

  const recommendations = useMemo(
    () => [...menus].sort((a, b) => {
      const score = (menu: Menu) => {
        const affordable = menu.price <= budget ? 5 : -4;
        const onTime = menu.wait + menu.walk <= minutes ? 5 : -5;
        const fullnessFit = 5 - Math.abs(menu.fullness - fullness);
        const afternoonFit = schedule === 'busy' ? menu.condition * 1.5 : menu.condition * 0.7;
        return affordable + onTime + fullnessFit + afternoonFit;
      };
      return score(b) - score(a);
    }),
    [budget, fullness, minutes, schedule],
  );

  const selectedMenu = recommendations.find((menu) => menu.name === selectedName) ?? recommendations[0];
  const totalMinutes = selectedMenu.wait + selectedMenu.walk;
  const pickupMinute = 8 + selectedMenu.wait;
  const pickupTime = `12:${String(pickupMinute).padStart(2, '0')}`;

  const reasonFor = (menu: Menu) => {
    const reasons: string[] = [];
    if (menu.price <= budget) reasons.push('예산 안');
    if (menu.wait + menu.walk <= minutes) reasons.push(`${menu.wait + menu.walk}분 완료`);
    if (Math.abs(menu.fullness - fullness) <= 1) reasons.push('포만감 적합');
    if (schedule === 'busy' && menu.condition >= 4) reasons.push('오후 일정 적합');
    return reasons.slice(0, 3).join(' · ') || '조건 일부 확인 필요';
  };

  const copyInvite = async () => {
    const invite = `${window.location.origin}/?group=lunchfit-demo`;
    try {
      await navigator.clipboard.writeText(invite);
      setInviteStatus('초대 링크를 복사했습니다.');
    } catch {
      setInviteStatus(`공유 링크: ${invite}`);
    }
  };

  const confirmReservation = (menuName = selectedMenu.name) => {
    const menu = menus.find((item) => item.name === menuName);
    if (!menu) throw new Error('해당 메뉴를 찾을 수 없습니다.');
    setSelectedName(menu.name);
    setReserved(true);
    setReservationOpen(true);
    return menu;
  };

  useEffect(() => {
    const context = typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const reportError = (error: unknown) => console.warn('WebMCP registration failed', error);

    void Promise.resolve(context.registerTool({
      name: 'update_lunch_preferences',
      title: '점심 조건 변경',
      description: '예산, 남은 시간, 원하는 포만감, 오후 일정 조건을 바꾸고 화면의 추천 순서를 갱신합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          budget: { type: 'number', minimum: 7000, maximum: 15000 },
          minutes: { type: 'number', minimum: 15, maximum: 60 },
          fullness: { type: 'number', minimum: 1, maximum: 5 },
          schedule: { type: 'string', enum: ['busy', 'normal'] },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const next = readPreferences(input);
        if (next.budget !== undefined) setBudget(next.budget);
        if (next.minutes !== undefined) setMinutes(next.minutes);
        if (next.fullness !== undefined) setFullness(next.fullness);
        if (next.schedule !== undefined) setSchedule(next.schedule);
        return { status: 'updated', preferences: next };
      },
    }, { signal: lifecycle.signal })).catch(reportError);

    void Promise.resolve(context.registerTool({
      name: 'reserve_lunch_pickup',
      title: '점심 픽업 예약',
      description: '메뉴 이름을 확인해 픽업 예약을 완료하고 화면에 성공 상태를 표시합니다.',
      inputSchema: {
        type: 'object',
        properties: { menuName: { type: 'string', enum: menus.map((menu) => menu.name) } },
        required: ['menuName'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('입력은 객체여야 합니다.');
        const menuName = (input as Record<string, unknown>).menuName;
        if (typeof menuName !== 'string') throw new Error('menuName이 필요합니다.');
        const menu = confirmReservation(menuName);
        return { status: 'confirmed', menuName: menu.name, pickupTime: `12:${String(8 + menu.wait).padStart(2, '0')}` };
      },
    }, { signal: lifecycle.signal })).catch(reportError);

    return () => lifecycle.abort();
  }, [selectedMenu.name]);

  const resetReservation = () => {
    setReserved(false);
    setReservationOpen(true);
  };

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-[#10233c]">
      <header className="border-b border-[#dce6e1] bg-white/95">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#123c69] text-lg font-black text-white">LF</span>
            <div>
              <p className="text-lg font-bold tracking-[-0.03em]">런치핏</p>
              <p className="text-xs text-[#65768a]">오늘 일정에 맞춘 점심 선택</p>
            </div>
          </div>
          <Button variant="outline" className="h-10 rounded-xl border-[#cbd9d2] px-4" onClick={copyInvite}>
            {inviteStatus ? <CheckCircle2 /> : <Users />} {inviteStatus || '동료 초대'}
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1440px] gap-6 px-5 py-7 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-10 lg:py-9">
        <aside className="self-start rounded-[28px] bg-[#102f52] p-6 text-white shadow-[0_20px_60px_rgba(18,60,105,0.15)] lg:sticky lg:top-6">
          <p className="text-sm font-semibold text-[#9de7c2]">9월 5일 토요일</p>
          <h1 className="mt-2 text-[clamp(2rem,4vw,3.3rem)] font-black leading-[1.05] tracking-[-0.06em]">점심까지<br />{minutes}분 남았어요</h1>
          <p className="mt-4 max-w-[31ch] text-[15px] leading-6 text-[#dbe8f3]">조건을 바꾸면 추천 순서와 충족 이유가 바로 달라집니다.</p>

          <div className="mt-7 space-y-6 border-t border-white/15 pt-6">
            <div className="block">
              <span className="mb-3 flex items-center justify-between text-sm"><span>남은 시간</span><strong>{minutes}분</strong></span>
              <Slider min={15} max={60} step={5} value={[minutes]} onValueChange={(value) => setMinutes(sliderValue(value))} aria-label="남은 시간" className="[&_[data-slot=slider-range]]:bg-[#75d7a5] [&_[data-slot=slider-thumb]]:size-5" />
            </div>
            <div className="block">
              <span className="mb-3 flex items-center justify-between text-sm"><span>한 끼 예산</span><strong>{budget.toLocaleString()}원</strong></span>
              <Slider min={7000} max={15000} step={500} value={[budget]} onValueChange={(value) => setBudget(sliderValue(value))} aria-label="한 끼 예산" className="[&_[data-slot=slider-range]]:bg-[#75d7a5] [&_[data-slot=slider-thumb]]:size-5" />
            </div>
            <div className="block">
              <span className="mb-3 flex items-center justify-between text-sm"><span>원하는 포만감</span><strong>{fullness} / 5</strong></span>
              <Slider min={1} max={5} step={1} value={[fullness]} onValueChange={(value) => setFullness(sliderValue(value))} aria-label="원하는 포만감" className="[&_[data-slot=slider-range]]:bg-[#75d7a5] [&_[data-slot=slider-thumb]]:size-5" />
            </div>
            <div>
              <span className="mb-3 block text-sm">오후 일정</span>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" aria-pressed={schedule === 'busy'} onClick={() => setSchedule('busy')} className={`rounded-xl border-white/20 ${schedule === 'busy' ? 'bg-[#75d7a5] text-[#102f52] hover:bg-[#75d7a5]' : 'bg-white/5 text-white hover:bg-white/10'}`}>회의 많음</Button>
                <Button type="button" variant="outline" aria-pressed={schedule === 'normal'} onClick={() => setSchedule('normal')} className={`rounded-xl border-white/20 ${schedule === 'normal' ? 'bg-[#75d7a5] text-[#102f52] hover:bg-[#75d7a5]' : 'bg-white/5 text-white hover:bg-white/10'}`}>보통</Button>
              </div>
            </div>
          </div>

          <div className="relative mt-7 overflow-hidden rounded-2xl">
            <Image src="/lunchfit-meal.png" alt="균형 잡힌 점심 메뉴" width={1536} height={1024} className="h-36 w-full object-cover" priority />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102f52]/90 to-transparent p-4 pt-10 text-sm font-semibold">빠른 픽업용 균형 메뉴</div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-[#1f8a5b]"><Sparkles className="size-4" /> 런치핏 추천</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">시간 안에 만족할 메뉴 3개</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#617084]">실습 데이터에서 확인한 가격, 대기시간, 포만감, 오후 컨디션을 기준으로 정렬합니다.</p>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {recommendations.map((menu, index) => {
              const active = selectedMenu.name === menu.name;
              const safe = menu.price <= budget && menu.wait + menu.walk <= minutes;
              return (
                <button key={menu.name} type="button" onClick={() => { setSelectedName(menu.name); setReserved(false); }} className={`group rounded-[24px] border p-5 text-left transition ${active ? 'border-[#123c69] bg-white shadow-[0_16px_45px_rgba(27,60,85,0.13)]' : 'border-[#d8e3de] bg-white/75 hover:border-[#92aa9f]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-[#e7f7ef] px-3 py-1 text-xs font-bold text-[#14734b]">{index + 1}순위 · {menu.tag}</span>
                    <span className={`text-xs font-bold ${safe ? 'text-[#14734b]' : 'text-[#b05a32]'}`}>{safe ? '조건 충족' : '조건 확인'}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold tracking-[-0.035em]">{menu.name}</h3>
                  <p className="mt-1 text-sm text-[#6c7a8a]">{menu.shop} · {menu.protein}</p>
                  <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm">
                    <div><dt className="text-xs text-[#7a8795]">가격</dt><dd className="mt-0.5 font-bold">{menu.price.toLocaleString()}원</dd></div>
                    <div><dt className="text-xs text-[#7a8795]">총 소요</dt><dd className="mt-0.5 font-bold">{menu.wait + menu.walk}분</dd></div>
                    <div><dt className="text-xs text-[#7a8795]">포만감</dt><dd className="mt-0.5 font-bold">{menu.fullness} / 5</dd></div>
                    <div><dt className="text-xs text-[#7a8795]">오후 컨디션</dt><dd className="mt-0.5 font-bold">{menu.condition} / 5</dd></div>
                  </dl>
                  <p className="mt-5 border-t border-[#e4ebe7] pt-4 text-xs font-semibold text-[#1f6f50]">추천 근거 · {reasonFor(menu)}</p>
                </button>
              );
            })}
          </div>

          <section className="mt-5 grid gap-5 rounded-[28px] bg-white p-6 shadow-[0_16px_50px_rgba(35,61,50,0.08)] md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-bold text-[#1f8a5b]">선택한 메뉴</p>
              <h3 className="mt-1 text-2xl font-black tracking-[-0.04em]">{selectedMenu.name}</h3>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#536578]">
                <span className="flex items-center gap-1.5"><MapPin className="size-4" /> 도보 {selectedMenu.walk}분</span>
                <span className="flex items-center gap-1.5"><Clock3 className="size-4" /> {pickupTime} 픽업</span>
                <span className="flex items-center gap-1.5"><Users className="size-4" /> 공동주문 가능</span>
              </div>
              <p className="mt-3 text-xs text-[#748295]">예상시간과 컨디션은 시연용 추정값이며 건강 진단 정보가 아닙니다.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-12 rounded-xl border-[#cbd9d2] px-5 font-bold" onClick={copyInvite}><Copy /> 공동주문</Button>
              <Button className="h-12 rounded-xl bg-[#ea6a3b] px-6 text-base font-bold text-white hover:bg-[#d95b2f]" onClick={resetReservation}>픽업 예약하기</Button>
            </div>
          </section>
        </div>
      </section>

      <Dialog open={reservationOpen} onOpenChange={setReservationOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          {reserved ? (
            <>
              <DialogHeader>
                <CheckCircle2 className="size-12 text-[#1f8a5b]" />
                <DialogTitle className="text-2xl font-black">픽업 예약이 완료됐어요</DialogTitle>
                <DialogDescription>{selectedMenu.name}을 {pickupTime}에 준비합니다. 도착하면 이름을 알려주세요.</DialogDescription>
              </DialogHeader>
              <div className="rounded-2xl bg-[#eaf6f0] p-4 text-sm text-[#164f39]">이 화면은 시연용입니다. 실제 주문이나 결제는 처리되지 않습니다.</div>
              <DialogFooter className="mt-2 bg-transparent px-0 pb-0">
                <Button variant="outline" onClick={() => setReservationOpen(false)}>닫기</Button>
                <Button className="bg-[#1f8a5b] text-white hover:bg-[#187249]" onClick={() => { setReservationOpen(false); setFeedbackOpen(true); }}>식후 평가 미리보기</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">{pickupTime} 픽업을 예약할까요?</DialogTitle>
                <DialogDescription>{selectedMenu.shop} · {selectedMenu.name} · {selectedMenu.price.toLocaleString()}원</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f4f7f5] p-4 text-sm">
                <span>총 소요 <strong>{totalMinutes}분</strong></span>
                <span>포만감 <strong>{selectedMenu.fullness}/5</strong></span>
                <span>오후 컨디션 <strong>{selectedMenu.condition}/5</strong></span>
                <span>추천 이유 <strong>{reasonFor(selectedMenu)}</strong></span>
              </div>
              <DialogFooter className="mt-2 bg-transparent px-0 pb-0">
                <Button variant="outline" onClick={() => setReservationOpen(false)}>취소</Button>
                <Button className="bg-[#ea6a3b] text-white hover:bg-[#d95b2f]" onClick={() => confirmReservation()}>시연 예약 확정</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">식후 상태를 알려주세요</DialogTitle>
            <DialogDescription>두 평가가 다음 추천 순서를 조정하는 데 사용됩니다. 시연 종료 후 저장되지 않습니다.</DialogDescription>
          </DialogHeader>
          {feedbackSaved ? (
            <div className="rounded-2xl bg-[#eaf6f0] p-5 text-center font-bold text-[#164f39]">평가가 반영되었습니다. 감사합니다.</div>
          ) : (
            <div className="space-y-7 rounded-2xl bg-[#f4f7f5] p-5">
              <div className="block">
                <span className="mb-3 flex justify-between text-sm"><span>포만감</span><strong>{feedbackFullness}/5</strong></span>
                <Slider min={1} max={5} step={1} value={[feedbackFullness]} onValueChange={(value) => setFeedbackFullness(sliderValue(value))} aria-label="식후 포만감 평가" />
              </div>
              <div className="block">
                <span className="mb-3 flex justify-between text-sm"><span>오후 컨디션</span><strong>{feedbackCondition}/5</strong></span>
                <Slider min={1} max={5} step={1} value={[feedbackCondition]} onValueChange={(value) => setFeedbackCondition(sliderValue(value))} aria-label="오후 컨디션 평가" />
              </div>
            </div>
          )}
          <DialogFooter className="mt-2 bg-transparent px-0 pb-0">
            {feedbackSaved ? (
              <Button onClick={() => setFeedbackOpen(false)}>닫기</Button>
            ) : (
              <Button className="bg-[#1f8a5b] text-white hover:bg-[#187249]" onClick={() => setFeedbackSaved(true)}>평가 저장</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
