import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { listAttemptContexts } from '../../../features/attempts/api.js'
import AttemptContextChooser from '../../../features/attempts/components/AttemptContextChooser.vue'
import BriefingPanel from '../components/BriefingPanel.vue'
import CommandReference from '../components/CommandReference.vue'
import ConceptTags from '../components/ConceptTags.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import IncidentBanner from '../components/IncidentBanner.vue'
import PausedPanel from '../components/PausedPanel.vue'
import ReviewNote from '../components/ReviewNote.vue'
import ScoreHud from '../components/ScoreHud.vue'
import ShiftDebrief from '../components/ShiftDebrief.vue'
import TerminalPanel from '../components/TerminalPanel.vue'

vi.mock('../../../features/attempts/api.js', () => ({
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
  safeAttemptError: () => ({ message: 'error' }),
}))

async function chooseContext(wrapper) {
  await flushPromises()
  wrapper.getComponent(AttemptContextChooser).vm.$emit('start', { kind: 'personal' })
  await wrapper.vm.$nextTick()
}

const CLASSES = {
  cohorts: [{ cohortId: 'c1', institutionName: 'SMU', cohortName: 'IS216 G7' }],
  total: 1,
}

function debriefResult(mode = 'timed') {
  return {
    mode,
    saved: true,
    score: 300,
    maxScore: 2100,
    result: { bestStreak: 2 },
    feedback: { summary: 'You contained 2 of 8 incidents.' },
    topicOutcomes: [],
    debrief: [],
  }
}

function mountDebrief(props = {}) {
  return mount(ShiftDebrief, {
    props: { result: debriefResult(props.mode), ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('cli defender components', () => {
  it('starts practice at once but confirms a timed shift first', async () => {
    const wrapper = mount(BriefingPanel)
    expect(wrapper.text()).not.toContain('Practice (no timer)')
    await chooseContext(wrapper)
    expect(wrapper.text()).toContain('Practice (no timer)')
    const [timed, practice] = wrapper.findAll('section > div > button')
    await practice.trigger('click')
    expect(wrapper.emitted('start')).toEqual([['practice', { kind: 'personal' }]])
    await timed.trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
    const dialog = wrapper.getComponent(ConfirmDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.text()).toContain('saved to your account')
    dialog.vm.$emit('cancel')
    await wrapper.vm.$nextTick()
    expect(dialog.props('open')).toBe(false)
    await timed.trigger('click')
    dialog.vm.$emit('confirm')
    expect(wrapper.emitted('start')).toEqual([
      ['practice', { kind: 'personal' }],
      ['timed', { kind: 'personal' }],
    ])
  })

  it('emits confirm, cancel and escape from the dialog', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { id: 'test', open: true, title: 'Leave?', confirmLabel: 'Leave' },
      slots: { default: 'Progress is lost.' },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('dialog').attributes('aria-labelledby')).toBe('test-title')
    expect(wrapper.text()).toContain('Progress is lost.')
    await wrapper.get('.cli-btn-primary').trigger('click')
    await wrapper.findAll('button')[0].trigger('click')
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(2)
    wrapper.unmount()
  })

  it('emits a typed command and recalls history with the arrow keys', async () => {
    const wrapper = mount(TerminalPanel, {
      props: {
        lines: [{ id: 1, kind: 'ok', text: '[ OK ] done' }],
        modelValue: 'isolate host lab-02',
        history: ['block ip 192.0.2.1', 'disable user ops-lee'],
      },
    })
    expect(wrapper.get('[role="log"]').text()).toContain('[ OK ] done')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit-command')).toEqual([['isolate host lab-02']])
    const input = wrapper.get('input')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['disable user ops-lee'],
      ['block ip 192.0.2.1'],
      ['disable user ops-lee'],
    ])
    expect(input.attributes('maxlength')).toBe('120')
    expect(input.attributes('autocapitalize')).toBe('off')
    expect(wrapper.get('label').text()).toContain('Command')
  })

  it('inserts command templates for touch users', async () => {
    const wrapper = mount(CommandReference)
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(6)
    for (const button of buttons) await button.trigger('click')
    expect(wrapper.emitted('insert-template')).toEqual([
      ['block ip '],
      ['disable user '],
      ['isolate host '],
      ['logs '],
      ['whois '],
      ['dismiss'],
    ])
    expect(wrapper.text()).toContain('Read the log of a host')
  })

  it('shows lookup use and step progress without revealing the step count', () => {
    const incident = {
      incidentId: 'incident-07',
      windowSeconds: 25,
      stepsDone: 1,
      lookups: { used: 2, limit: 6, results: [] },
      alert: { title: 'Sweep', severity: 'high', source: 'Sensor', lines: ['a b'] },
    }
    const wrapper = mount(IncidentBanner, { props: { incident, remainingMs: 20_000 } })
    expect(wrapper.text()).toContain('Lookups used: 2 of 6')
    expect(wrapper.text()).toContain('Step 1 done, the incident is still open')
    expect(wrapper.text()).not.toMatch(/of 2|two/i)
  })

  it('cues a time penalty visibly and for screen readers', () => {
    const wrapper = mount(ScoreHud, {
      props: { remainingMs: 12_000, penalty: { key: 1, seconds: 5 } },
    })
    expect(wrapper.get('.cli-penalty-cue').text()).toBe('-5 s')
    expect(wrapper.get('[role="status"]').text()).toBe('5 seconds cut from the clock.')
    expect(mount(ScoreHud).find('.cli-penalty-cue').exists()).toBe(false)
  })

  it('shows the decoy label in the last incident note', () => {
    const wrapper = mount(ReviewNote, {
      props: {
        review: {
          outcome: 'wrong',
          expectedCommand: 'dismiss',
          decoy: true,
          explanation: 'Planned work.',
          concepts: { attack: null, cia: [], stage: 'Containment' },
        },
      },
    })
    expect(wrapper.text()).toContain('false alarm')
    expect(wrapper.text()).toContain('dismiss')
  })

  it('describes the incident and its window in text', () => {
    const wrapper = mount(IncidentBanner, {
      props: {
        incident: {
          incidentId: 'incident-02',
          index: 1,
          windowSeconds: 6,
          alert: { title: 'Port sweep', severity: 'low', source: 'Firewall', lines: ['a', 'b'] },
        },
        remainingMs: 3000,
        mode: 'timed',
      },
    })
    expect(wrapper.text()).toContain('low')
    expect(wrapper.text()).toContain('You have 6 seconds for this incident.')
    expect(wrapper.get('.cli-countdown').attributes('aria-hidden')).toBe('true')
  })

  it('focuses resume on the paused panel', async () => {
    const wrapper = mount(PausedPanel, { attachTo: document.body })
    expect(document.activeElement).toBe(wrapper.get('button').element)
    expect(wrapper.text()).toContain('Take a breather')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('resume')).toHaveLength(1)
    wrapper.unmount()
  })

  it('makes alert names tappable and highlights the hinted line', async () => {
    const wrapper = mount(IncidentBanner, {
      props: {
        mode: 'practice',
        incident: {
          incidentId: 'incident-01',
          index: 0,
          windowSeconds: null,
          hintLine: 1,
          alert: {
            title: 'Port sweep',
            severity: 'low',
            source: 'Firewall',
            lines: ['src 192.0.2.66 swept ports', 'no exploit traffic'],
            segments: [
              [{ text: 'src ' }, { target: '192.0.2.66', kind: 'ip' }, { text: ' swept ports' }],
              [{ text: 'no exploit traffic' }],
            ],
          },
        },
      },
    })
    expect(wrapper.findAll('li')[0].text()).toBe('src 192.0.2.66 swept ports')
    await wrapper.get('button[aria-label="Use 192.0.2.66 as the target"]').trigger('click')
    expect(wrapper.emitted('select-target')).toEqual([['192.0.2.66']])
    expect(wrapper.findAll('li')[1].classes()).toContain('cli-hint-line')
    expect(wrapper.findAll('li')[1].text()).toContain('hint')
    await wrapper.setProps({ interactive: false })
    expect(wrapper.get('.cli-entity').attributes('disabled')).toBeDefined()
  })

  it('lists concept tags as text', () => {
    const wrapper = mount(ConceptTags, {
      props: { concepts: { attack: 'Ransomware', cia: ['Availability'], stage: 'Containment' } },
    })
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'Ransomware',
      'Availability at risk',
      'Containment',
    ])
  })

  it('fills the streak meter up to three', async () => {
    const wrapper = mount(ScoreHud, { props: { streak: 2 } })
    expect(wrapper.findAll('.cli-streak-pip.is-on')).toHaveLength(2)
    await wrapper.setProps({ streak: 5 })
    expect(wrapper.findAll('.cli-streak-pip.is-on')).toHaveLength(3)
    expect(wrapper.get('.cli-streak-meter').classes()).toContain('is-max')
  })

  it('celebrates a perfect game and tallies topics in a table', () => {
    const wrapper = mount(ShiftDebrief, {
      props: {
        result: {
          mode: 'practice',
          saved: true,
          score: 2100,
          maxScore: 2100,
          result: { bestStreak: 8 },
          feedback: { summary: 'You contained 8 of 8 incidents.' },
          topicOutcomes: [
            { topic: 'firewall-blocking', label: 'Firewall blocking', achieved: true },
            { topic: 'account-security', label: 'Account security', achieved: false },
          ],
          debrief: [
            {
              incidentId: 'incident-01',
              title: 'Port sweep',
              outcome: 'correct',
              yourCommand: 'block ip 192.0.2.66',
              expectedCommand: 'block ip 192.0.2.66',
              explanation: 'Block the scanner.',
              pointsAwarded: 100,
              hintUsed: true,
              topic: 'firewall-blocking',
              concepts: {
                attack: 'Reconnaissance',
                cia: ['Confidentiality'],
                stage: 'Containment',
              },
            },
          ],
        },
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Perfect game')
    expect(wrapper.findAll('.cli-confetti-piece').length).toBeGreaterThan(0)
    expect(wrapper.get('.cli-confetti').attributes('aria-hidden')).toBe('true')
    const rows = wrapper.findAll('.cli-topic-table tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('Firewall blocking')
    expect(rows[0]).toContain('1/1')
    expect(rows[0]).toContain('Strong')
    expect(rows[1]).toContain('Account security')
    expect(rows[1]).toContain('Review')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).not.toContain('Back to town')
    expect(wrapper.text()).toContain('hint used')
    expect(wrapper.text()).toContain('Reconnaissance')
  })

  it('labels practice as untimed in the hud', () => {
    const wrapper = mount(ScoreHud, { props: { mode: 'practice', score: 1200, streak: 4 } })
    expect(wrapper.text()).toContain('untimed')
    expect(wrapper.text()).toContain('1,200')
  })

  it('renders the debrief with text outcomes and replays', async () => {
    const wrapper = mount(ShiftDebrief, {
      props: {
        result: {
          mode: 'timed',
          saved: false,
          saveError: { code: 'COHORT_NOT_FOUND', message: 'Class unavailable.' },
          score: 300,
          maxScore: 2100,
          result: { bestStreak: 2 },
          feedback: { summary: 'You contained 2 of 8 incidents.' },
          topicOutcomes: [
            { topic: 'firewall-blocking', label: 'Firewall blocking', achieved: false },
          ],
          debrief: [
            {
              incidentId: 'incident-01',
              title: 'Port sweep',
              outcome: 'missed',
              yourCommand: null,
              yourCommands: [],
              lookupsUsed: 2,
              decoy: false,
              expectedCommand: 'block ip 192.0.2.66',
              expectedCommands: ['block ip 192.0.2.66'],
              explanation: 'Block the scanner.',
              pointsAwarded: 0,
            },
            {
              incidentId: 'incident-02',
              title: 'Backup upload',
              outcome: 'wrong',
              yourCommand: 'isolate host backup-srv',
              yourCommands: ['isolate host backup-srv'],
              lookupsUsed: 1,
              decoy: true,
              expectedCommand: 'dismiss',
              expectedCommands: ['dismiss'],
              explanation: 'Planned backup.',
              pointsAwarded: 0,
            },
            {
              incidentId: 'incident-03',
              title: 'Sweep',
              outcome: 'correct',
              yourCommand: 'disable user svc-print',
              yourCommands: ['isolate host kiosk-04', 'disable user svc-print'],
              lookupsUsed: 3,
              decoy: false,
              expectedCommand: 'isolate host kiosk-04 then disable user svc-print',
              expectedCommands: ['isolate host kiosk-04', 'disable user svc-print'],
              explanation: 'Isolate first.',
              pointsAwarded: 300,
            },
          ],
        },
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('MISSED')
    expect(wrapper.text()).toContain('block ip 192.0.2.66')
    // decoy label, both ordered steps and the lookup count are shown as text
    expect(wrapper.text()).toContain('false alarm')
    expect(wrapper.text()).toContain('isolate host kiosk-04')
    expect(wrapper.text()).toContain('disable user svc-print')
    expect(wrapper.text()).toContain('Lookups used')
    expect(wrapper.text()).not.toContain('Result saved to your account.')
    expect(wrapper.get('[role="alert"]').text()).toContain('Class unavailable.')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(wrapper.emitted('retry-save')).toHaveLength(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Play again'))
      .trigger('click')
    expect(wrapper.emitted('replay')).toHaveLength(1)
  })

  describe('replay choice', () => {
    it('summarises the last run and replays with it', async () => {
      const wrapper = mountDebrief({ mode: 'practice' })
      await flushPromises()
      expect(wrapper.get('[data-testid="cli-next-run"]').text()).toBe(
        'Next run: Personal practice · Practice',
      )
      const change = wrapper.get('button[aria-controls="cli-replay-options"]')
      expect(change.attributes('aria-expanded')).toBe('false')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Play again')
        .trigger('click')
      expect(wrapper.emitted('replay')).toEqual([
        [{ mode: 'practice', context: { kind: 'personal' } }],
      ])
    })

    it('loads classes on first open and updates the summary and payload', async () => {
      listAttemptContexts.mockResolvedValueOnce(CLASSES)
      const wrapper = mountDebrief()
      expect(listAttemptContexts).not.toHaveBeenCalled()
      const change = wrapper.get('button[aria-controls="cli-replay-options"]')
      await change.trigger('click')
      await flushPromises()
      expect(change.attributes('aria-expanded')).toBe('true')
      const select = wrapper.get('select')
      expect(wrapper.get('label[for="cli-replay-context"]').text()).toBe('Save this run to')
      expect(wrapper.get('fieldset legend').text()).toBe('Mode')
      await select.setValue('c1')
      await wrapper.get('input[value="practice"]').setValue()
      expect(wrapper.get('[data-testid="cli-next-run"]').text()).toBe(
        'Next run: SMU · IS216 G7 · Practice',
      )
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Play again')
        .trigger('click')
      expect(wrapper.emitted('replay')).toEqual([
        [{ mode: 'practice', context: { kind: 'cohort', cohortId: 'c1' } }],
      ])
      await change.trigger('click')
      expect(listAttemptContexts).toHaveBeenCalledTimes(1)
    })

    it('preselects the previous class and falls back when it is gone', async () => {
      listAttemptContexts.mockResolvedValueOnce(CLASSES)
      const kept = mountDebrief({ context: { kind: 'cohort', cohortId: 'c1' } })
      await flushPromises()
      expect(kept.get('[data-testid="cli-next-run"]').text()).toContain('SMU · IS216 G7')
      listAttemptContexts.mockResolvedValueOnce({ cohorts: [], total: 0 })
      const gone = mountDebrief({ context: { kind: 'cohort', cohortId: 'old' } })
      await flushPromises()
      expect(gone.get('[data-testid="cli-next-run"]').text()).toContain('Personal practice')
      await gone
        .findAll('button')
        .find((b) => b.text() === 'Play again')
        .trigger('click')
      expect(gone.emitted('replay')[0][0].context).toEqual({ kind: 'personal' })
    })

    it('shows an error with retry when the class list fails', async () => {
      listAttemptContexts.mockRejectedValueOnce(new Error('down'))
      const wrapper = mountDebrief()
      await wrapper.get('button[aria-controls="cli-replay-options"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('error')
      listAttemptContexts.mockResolvedValueOnce({ cohorts: [], total: 0 })
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Retry class list')
        .trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('You have no active classes')
    })
  })
})
