import { COOLDOWN_MS, LIFETIME_MS, TIMEZONE, EDITION_LIMIT } from './policy.js'

// the sample edition: made-up stories set in sharlock town, written for this project. no real publisher, person,
// company or incident appears here, and there are no links out. shown only when nothing live or cached can be served
export const SAMPLE_PROVIDER = 'Sample edition'

const HOUR = 3600000
const DESK = 'Sharlock Times sample desk'

const STORIES = {
  cybersecurity: [
    {
      slug: 'lamplighters-phish',
      hoursAgo: 3,
      title: 'Lamplighters’ guild warned after fake pay notice reaches every member',
      excerpt:
        'A made-up telegram asked members to confirm their wages at a look-alike counting house. The guild reminded everyone that it never asks for a password by message.',
    },
    {
      slug: 'harbour-ledger',
      hoursAgo: 20,
      title: 'Harbour office locks its ledgers after a shared password is found on a noticeboard',
      excerpt:
        'Clerks in this fictional port shared a single login for years. Each now has an account of their own, and a second check when they sign in.',
    },
    {
      slug: 'bakery-patch',
      hoursAgo: 44,
      title: 'Town bakery’s ordering page was open to anyone for a week, audit finds',
      excerpt:
        'Changing a number in the address showed other customers’ orders. The invented bakery now checks who is asking on every request, not only at the front door.',
    },
    {
      slug: 'tram-usb',
      hoursAgo: 70,
      title: 'Stray memory sticks left on the Number 4 tram were a test, says the watch',
      excerpt:
        'Almost a third of those found were plugged in by curious passengers. The town watch ran the exercise in this sample story to show why found devices stay unplugged.',
    },
    {
      slug: 'school-backup',
      hoursAgo: 96,
      title: 'School recovers its timetable from an old backup after a ransom note appears',
      excerpt:
        'The imaginary school paid nothing. Copies kept away from the main machine meant only one day of changes were lost.',
    },
    {
      slug: 'clockmaker-update',
      hoursAgo: 120,
      title: 'Clockmaker delays a software update, then spends a weekend repairing the shop',
      excerpt:
        'A known fault in the shop’s till software had a fix for months. This fictional case is a reminder that updates close doors attackers already know about.',
    },
    {
      slug: 'market-qr',
      hoursAgo: 240,
      older: true,
      title: 'Market stalls find sticker codes placed over their real payment codes',
      excerpt:
        'Shoppers in this made-up market were sent to a copy of the payment page. Stallholders now check their signs each morning.',
    },
    {
      slug: 'library-mfa',
      hoursAgo: 408,
      older: true,
      title: 'Library adds a second sign-in step after a borrowed-card scare',
      excerpt:
        'A guessed password opened one reader’s account in this invented town. The new step stopped the same trick the following week.',
    },
  ],
  technology: [
    {
      slug: 'town-clock-sensors',
      hoursAgo: 5,
      title: 'Town clock gains small sensors that report when its hands fall behind',
      excerpt:
        'A made-up project lets the keeper check the clock from the workshop. Each sensor sends only the time it reads, and nothing about the square below.',
    },
    {
      slug: 'river-buoys',
      hoursAgo: 30,
      title: 'River buoys now send water levels to the harbour every ten minutes',
      excerpt:
        'This sample story follows a fictional harbour swapping paper logs for a simple feed that keeps working when the network drops.',
    },
    {
      slug: 'tram-timetable',
      hoursAgo: 75,
      title: 'Tram timetable app learns to work with no signal in the tunnel',
      excerpt:
        'Riders of the invented Number 4 line keep the day’s times on their own device, and the app updates them once it is back above ground.',
    },
    {
      slug: 'workshop-printer',
      hoursAgo: 110,
      title: 'Community workshop shares one printer between forty makers, and a queue',
      excerpt:
        'A short booking page ended the arguments in this fictional workshop, and showed how much a small tool can change a shared space.',
    },
    {
      slug: 'solar-lamps',
      hoursAgo: 300,
      older: true,
      title: 'Solar lamps on the pier report their own faults to the night watch',
      excerpt:
        'Each imaginary lamp sends a short message when it dims, so a repair can be planned before the pier goes dark.',
    },
  ],
}

// the same fields as a live edition, labelled in the response so the client cannot take it for news. never cached or
// counted against the daily allowance
export function sampleEdition(edition, now, refreshAvailableAt = now + COOLDOWN_MS) {
  const stories = STORIES[edition.section].filter(
    (story) => edition.range === 'month' || !story.older,
  )
  return {
    provider: SAMPLE_PROVIDER,
    sample: true,
    section: edition.section,
    range: edition.range,
    dateKey: edition.dateKey,
    timezone: TIMEZONE,
    window: { from: edition.window.from, to: edition.window.to },
    editionLimit: EDITION_LIMIT,
    articles: stories.map((story) => ({
      id: `sample/${edition.section}/${story.slug}`,
      title: story.title,
      url: '',
      publishedAt: new Date(now - story.hoursAgo * HOUR).toISOString(),
      excerpt: [{ type: 'text', text: story.excerpt }],
      byline: [{ type: 'text', text: DESK }],
      copyright: '',
    })),
    fetchedAt: new Date(now).toISOString(),
    freshUntil: new Date(refreshAvailableAt).toISOString(),
    expiresAt: new Date(now + LIFETIME_MS).toISOString(),
    refreshAvailableAt: new Date(refreshAvailableAt).toISOString(),
    stale: false,
    partial: false,
  }
}
