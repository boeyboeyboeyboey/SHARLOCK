import { FREE_MAIL_HOSTS } from './pools.js'
import { fakeHost } from './tricks.js'

// a scenario is one situation that can arrive as a genuine email or as a phish
// build(c, { verdict, phishType }) returns the content of one email; index.js turns it into public
// parts and a private answer. the subject, sender name and most of the request are shared between
// both verdicts so nothing on the surface gives the answer away
// tells name the part kinds a player should tap, resolved to ids later
// safeRoute is a sentence only genuine emails may carry (index.js adds it to about half of them);
// safeNote tells the player why it is reassuring. a phish never includes either
// to add a scenario, append one entry to SCENARIOS

const fake = (c, entity) => fakeHost(c.rng, c.tier, entity)
const last4 = (c) => String(c.rng.int(1000, 9999))
const digits = (c) => c.rng.int(1000, 9999)

function attachmentName(c, base) {
  const ladder = {
    1: ['.exe'],
    2: ['.html', '.docm'],
    3: ['.pdf.exe', '.xlsx.js', '.pdf.scr'],
  }
  return `${base}${c.rng.pick(ladder[c.tier])}`
}

// the label always shows the real address, so only the destination can betray a phish
function linkTo(entity, path) {
  const url = `https://${entity.domain}/${path}`
  return { label: url, destination: url }
}

function swapHost(url, host) {
  const { pathname } = new URL(url)
  return `https://${host}${pathname}`
}

// turns the genuine version of an email into the phish named by phishType
// opts: entity (the real sender's organisation), local (its address prefix), bec (pressure request)
function phishify(c, spec, phishType, { entity, local, bec }) {
  const out = { ...spec }
  const real = spec.senderAddress.split('@')[1]
  const f = fake(c, entity)

  if (phishType === 'lookalike') {
    out.senderAddress = `${local}@${f.host}`
    out.tells = ['sender']
    if (out.link) {
      out.link = { ...out.link, destination: swapHost(out.link.destination, f.host) }
      out.tells.push('link')
    }
    if (out.qr) {
      out.qr = { ...out.qr, decodedDestination: swapHost(out.qr.decodedDestination, f.host) }
      out.tells.push('qr')
    }
    out.explanation = `The sender is not ${entity.name}: ${f.note}.`
  } else if (phishType === 'spoof') {
    const host = c.tier === 1 ? f.host : c.rng.pick(FREE_MAIL_HOSTS)
    out.senderAddress = `${local}@${host}`
    out.tells = ['sender']
    out.explanation = `The display name says ${spec.senderName}, but the address is on ${host}, not ${real}.`
  } else if (phishType === 'replyTo') {
    const replyHost = c.tier === 2 ? c.rng.pick(FREE_MAIL_HOSTS) : f.host
    out.replyTo = `${local}@${replyHost}`
    out.tells = ['replyTo']
    out.explanation = `The message looks genuine, but replies would go to ${out.replyTo} instead of ${spec.senderAddress}.`
  } else if (phishType === 'linkMismatch') {
    out.link = { ...out.link, destination: swapHost(out.link.destination, f.host) }
    out.tells = ['link']
    out.explanation = `The link text shows ${real} but it opens ${f.host}: ${f.note}.`
  } else if (phishType === 'qr') {
    out.qr = { ...out.qr, decodedDestination: swapHost(out.qr.decodedDestination, f.host) }
    out.tells = ['qr']
    out.explanation = `The code points to ${f.host}, not ${real}: ${f.note}.`
  } else if (phishType === 'attachment') {
    out.attachment = { fileName: attachmentName(c, out.attachment.base) }
    out.tells = ['attachment']
    out.explanation =
      'The attachment is an executable or script disguised as a document, so opening it could run malicious code.'
  } else if (phishType === 'bec') {
    out.senderAddress = `${local}@${f.host}`
    out.request = bec.request
    if (bec.body) out.body = bec.body
    out.tells = ['sender', 'request']
    out.explanation = `${bec.what} Real requests like this are checked through a channel you already trust, and the sender is a lookalike: ${f.note}.`
  }
  return out
}

function finish(c, { verdict, phishType }, spec, opts) {
  if (verdict === 'legit') return { ...spec, tells: [], explanation: '' }
  return phishify(c, spec, phishType, opts)
}

const attachment = (base, ext) => ({ base, fileName: `${base}${ext}` })

export const SCENARIOS = [
  {
    id: 'password-expiry',
    phishTypes: ['lookalike', 'linkMismatch', 'spoof'],
    safeRoute: 'You can also reach the staff portal yourself without using the link.',
    safeNote: 'It points you to the staff portal you already know.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} IT Service Desk`,
          senderAddress: `servicedesk@${c.org.domain}`,
          subject: 'Your password expires soon',
          request:
            'Your password expires in two days. Change it from the staff portal to keep access to your mailbox.',
          body: [`This notice was sent to all ${c.org.short} staff.`],
          link: linkTo(c.org, 'password'),
        },
        { entity: c.org, local: 'servicedesk' },
      )
    },
  },
  {
    id: 'sign-in-alert',
    phishTypes: ['lookalike', 'linkMismatch', 'replyTo'],
    safeRoute: 'You can also open the security page yourself instead of using the link.',
    safeNote: 'It points you to the security page you already know.',
    build(c, v) {
      const mfa = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Security`,
          senderAddress: `security@${c.org.domain}`,
          subject: mfa ? 'Approve your sign-in request' : 'New sign-in to your account',
          request: mfa
            ? 'A sign-in is waiting for your approval. If you did not start it, review your devices on the security page.'
            : 'We noticed a sign-in from a new laptop. If this was you, no action is needed; otherwise review it on the security page.',
          body: [],
          link: linkTo(c.org, 'security/devices'),
        },
        { entity: c.org, local: 'security' },
      )
    },
  },
  {
    id: 'mailbox-full',
    phishTypes: ['lookalike', 'linkMismatch', 'spoof'],
    safeRoute: 'You can also archive messages from your mail app without using the link.',
    safeNote: 'It lets you fix the problem without the link.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} IT Service Desk`,
          senderAddress: `servicedesk@${c.org.domain}`,
          subject: 'Your mailbox is almost full',
          request:
            'Your mailbox is at 95% of its limit. Archive old messages from the staff portal to free some space.',
          body: ['Mailboxes are limited to 50 GB.'],
          link: linkTo(c.org, 'mailbox/storage'),
        },
        { entity: c.org, local: 'servicedesk' },
      )
    },
  },
  {
    id: 'software-update',
    phishTypes: ['lookalike', 'linkMismatch', 'attachment'],
    safeRoute: 'You can also open the software centre on your device instead of using the link.',
    safeNote: 'It points you to the software centre you already have.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} IT Service Desk`,
          senderAddress: `servicedesk@${c.org.domain}`,
          subject: 'Software update required',
          request:
            'A required update is rolling out this week. Follow the attached guide and install it from the software centre.',
          body: [],
          link: linkTo(c.org, 'software/centre'),
          attachment: attachment(`Update_Guide_${digits(c)}`, '.pdf'),
        },
        { entity: c.org, local: 'servicedesk' },
      )
    },
  },
  {
    id: 'device-enrolment',
    phishTypes: ['qr', 'lookalike', 'spoof'],
    safeRoute: 'You can also enrol from the staff portal on your computer.',
    safeNote: 'It offers a second route through the staff portal.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Staff Services`,
          senderAddress: `services@${c.org.domain}`,
          subject: 'Enrol your new device',
          request:
            'Your new phone needs to be enrolled for sign-in codes. Scan the code with the new phone to finish.',
          body: [],
          qr: {
            caption: 'Scan to enrol',
            decodedDestination: `https://${c.org.domain}/enrol/device`,
          },
        },
        { entity: c.org, local: 'services' },
      )
    },
  },
  {
    id: 'vendor-invoice',
    phishTypes: ['attachment', 'lookalike', 'bec'],
    safeRoute: 'You can check it against the purchase order you already hold.',
    safeNote: 'The invoice matches a purchase order you can look up yourself.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.vendor.name} Accounts`,
          senderAddress: `accounts@${c.vendor.domain}`,
          subject: `Invoice ${c.ref} for ${c.vendor.product}`,
          request: `Invoice ${c.ref} is attached and falls due at the end of the month.`,
          body: [`This matches purchase order PO-${digits(c)} raised last week.`],
          attachment: attachment(`Invoice_${digits(c)}`, '.pdf'),
        },
        {
          entity: c.vendor,
          local: 'accounts',
          bec: {
            request: `Pay invoice ${c.ref} to our new account today and reply with the payment slip. Please do not call us about it.`,
            body: [`The new account ends in ${last4(c)}.`],
            what: 'Paying to a new account on demand, with no call to check, is a classic invoice fraud.',
          },
        },
      )
    },
  },
  {
    id: 'bank-detail-change',
    phishTypes: ['bec', 'lookalike', 'replyTo'],
    safeRoute:
      'Confirm the new details by calling the number you already have on file before you use them.',
    safeNote: 'It tells you to confirm the change by phone on a number you already have.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.vendor.name} Accounts`,
          senderAddress: `accounts@${c.vendor.domain}`,
          subject: 'Updated banking details',
          request:
            'Our bank account is changing next month. Please update your records before then.',
          body: [`The new account ends in ${last4(c)}.`],
        },
        {
          entity: c.vendor,
          local: 'accounts',
          bec: {
            request:
              'Our bank account has changed. Use the new account for all payments from today. Reply to confirm and do not call our office.',
            what: 'A bank detail change that forbids a check-back call is a fraud pattern.',
          },
        },
      )
    },
  },
  {
    id: 'payslip-ready',
    phishTypes: ['attachment', 'spoof', 'lookalike'],
    safeRoute: 'You can also view it any time in the staff portal.',
    safeNote: 'The staff portal shows the same payslip.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Payroll`,
          senderAddress: `payroll@${c.org.domain}`,
          subject: 'Your payslip is ready',
          request: 'Your payslip for this month is attached.',
          body: [],
          attachment: attachment(`Payslip_${digits(c)}`, '.pdf'),
        },
        { entity: c.org, local: 'payroll' },
      )
    },
  },
  {
    id: 'expense-claim',
    phishTypes: ['linkMismatch', 'replyTo', 'lookalike'],
    safeRoute: 'You can also find the claim by signing in to the expenses portal yourself.',
    safeNote: 'It points you to the expenses portal you already know.',
    build(c, v) {
      const ref = `EXP-${digits(c)}`
      const approved = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Finance`,
          senderAddress: `expenses@${c.org.domain}`,
          subject: approved ? 'Your expense claim was approved' : 'Your expense claim was rejected',
          request: approved
            ? `Claim ${ref} was approved and will be paid with this month's salary. You can review it in the expenses portal.`
            : `Claim ${ref} was rejected because a receipt is missing. Open it in the expenses portal to add the receipt.`,
          body: [],
          link: linkTo(c.org, 'expenses/claims'),
        },
        { entity: c.org, local: 'expenses' },
      )
    },
  },
  {
    id: 'urgent-executive-payment',
    phishTypes: ['bec', 'spoof', 'lookalike'],
    safeRoute:
      'Raise it through the finance system or procurement as usual, so it is approved there.',
    safeNote: 'It sends you through the normal approved finance route.',
    build(c, v) {
      const wire = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.person.full} (CEO)`,
          senderAddress: `${c.person.local}@${c.org.domain}`,
          subject: 'Urgent request for today',
          request: wire
            ? `Please arrange the supplier wire for ${c.ref} today.`
            : 'Please order the staff award gift cards today.',
          body: [],
        },
        {
          entity: c.org,
          local: c.person.local,
          bec: {
            request: wire
              ? 'I need a wire sent today for a confidential deal. Reply only to me and do not call anyone to check.'
              : 'I need gift cards bought today. Email me the codes and do not call me, I am in meetings.',
            what: wire
              ? 'A secret wire with no check is a classic fraud pattern.'
              : 'Gift card codes demanded by email are a classic fraud pattern.',
          },
        },
      )
    },
  },
  {
    id: 'shared-document',
    phishTypes: ['lookalike', 'linkMismatch', 'spoof'],
    safeRoute: 'You can also find the file in your shared drive without using the link.',
    safeNote: 'It points you to your own shared drive.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: c.person.full,
          senderAddress: `${c.person.local}@${c.org.domain}`,
          subject: 'Shared with you: team budget',
          request: 'I have shared the team budget file with you. Open it to add your figures.',
          body: [],
          link: linkTo(c.org, 'files/budget'),
        },
        { entity: c.org, local: c.person.local },
      )
    },
  },
  {
    id: 'e-signature',
    phishTypes: ['linkMismatch', 'attachment', 'lookalike'],
    safeRoute: 'You can also sign it from the contracts page after signing in yourself.',
    safeNote: 'It lets you reach the contracts page yourself.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Legal`,
          senderAddress: `contracts@${c.org.domain}`,
          subject: 'Document waiting for your signature',
          request: 'A contract is waiting for your signature. Review and sign it by Friday.',
          body: [],
          link: linkTo(c.org, 'sign/contract'),
          attachment: attachment(`Contract_${digits(c)}`, '.pdf'),
        },
        { entity: c.org, local: 'contracts' },
      )
    },
  },
  {
    id: 'calendar-change',
    phishTypes: ['spoof', 'lookalike', 'replyTo'],
    safeRoute: 'The change also shows in your calendar.',
    safeNote: 'You can confirm the change in your own calendar.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: c.person.full,
          senderAddress: `${c.person.local}@${c.org.domain}`,
          subject: 'Meeting moved to 3pm',
          request: 'The team meeting has moved to 3pm today. Please accept the new invite.',
          body: [],
        },
        { entity: c.org, local: c.person.local },
      )
    },
  },
  {
    id: 'voicemail',
    phishTypes: ['attachment', 'lookalike', 'spoof'],
    safeRoute: 'You can also listen to it from your desk phone.',
    safeNote: 'The message is also on your own phone.',
    build(c, v) {
      const fax = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Phone Services`,
          senderAddress: `voicemail@${c.org.domain}`,
          subject: fax ? 'Fax received' : 'New voicemail message',
          request: fax
            ? 'A two-page fax arrived for you. Open the attached copy to read it.'
            : 'You have a new voicemail. Open the attached transcript to read it.',
          body: [],
          attachment: attachment(fax ? `Fax_${digits(c)}` : `Voicemail_${digits(c)}`, '.pdf'),
        },
        { entity: c.org, local: 'voicemail' },
      )
    },
  },
  {
    id: 'parcel-delivery',
    phishTypes: ['linkMismatch', 'lookalike', 'replyTo'],
    safeRoute: 'You can also track it with the order number from your own account.',
    safeNote: 'It lets you track the order from your own account.',
    build(c, v) {
      const missed = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.vendor.name} Delivery`,
          senderAddress: `delivery@${c.vendor.domain}`,
          subject: missed ? 'Delivery attempt missed' : 'Your delivery is on its way',
          request: missed
            ? 'We missed you today. Book a new delivery slot for tomorrow.'
            : 'Your order will arrive tomorrow between 10am and 12pm. Someone must sign for it.',
          body: [],
          link: linkTo(c.vendor, 'track'),
        },
        { entity: c.vendor, local: 'delivery' },
      )
    },
  },
  {
    id: 'subscription-renewal',
    phishTypes: ['lookalike', 'linkMismatch', 'bec'],
    safeRoute: 'You can also manage it by signing in to your account yourself.',
    safeNote: 'It points you to your own account page.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.vendor.name} Billing`,
          senderAddress: `billing@${c.vendor.domain}`,
          subject: 'Your subscription renews soon',
          request: `Your ${c.vendor.product} plan renews on the 1st. Review the plan or cancel it from your account page.`,
          body: [],
          link: linkTo(c.vendor, 'account/billing'),
        },
        {
          entity: c.vendor,
          local: 'billing',
          bec: {
            request:
              'Your last payment failed. Reply with your card number and expiry date today to keep the service.',
            what: 'Asking for card details by reply is a payment scam.',
          },
        },
      )
    },
  },
  {
    id: 'event-qr',
    phishTypes: ['qr', 'lookalike', 'spoof'],
    safeRoute: 'You can also show your staff card at reception instead.',
    safeNote: 'It offers a second route that needs no code.',
    build(c, v) {
      const parking = c.rng.next() < 0.5
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Facilities`,
          senderAddress: `facilities@${c.org.domain}`,
          subject: parking ? 'Car park permit renewal' : 'Your check-in code for the town hall',
          request: parking
            ? 'Your permit expires this week. Scan the code to renew it.'
            : "Scan the code at the door to check in to Thursday's town hall.",
          body: [],
          qr: {
            caption: parking ? 'Scan to renew permit' : 'Scan to check in',
            decodedDestination: `https://${c.org.domain}/${parking ? 'permit' : 'checkin'}/${digits(c)}`,
          },
        },
        { entity: c.org, local: 'facilities' },
      )
    },
  },
  {
    id: 'benefits-deadline',
    phishTypes: ['lookalike', 'linkMismatch', 'replyTo'],
    safeRoute: 'You can also review it on the HR page of the staff portal.',
    safeNote: 'It points you to the HR page you already know.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Human Resources`,
          senderAddress: `hr@${c.org.domain}`,
          subject: 'Review your benefits statement',
          request: 'Review and confirm your benefits statement before the deadline on Friday.',
          body: ['Statements are issued once a year to all staff.'],
          link: linkTo(c.org, 'benefits/statement'),
        },
        { entity: c.org, local: 'hr' },
      )
    },
  },
  {
    id: 'policy-acknowledgement',
    phishTypes: ['attachment', 'linkMismatch', 'lookalike'],
    safeRoute: 'The policy is also on the staff intranet if you prefer to read it there.',
    safeNote: 'The policy is also on the intranet you already know.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Compliance`,
          senderAddress: `compliance@${c.org.domain}`,
          subject: 'Please acknowledge the updated policy',
          request:
            'Read the updated acceptable use policy and acknowledge it by the end of the month.',
          body: [],
          link: linkTo(c.org, 'policies/acknowledge'),
          attachment: attachment(`Policy_${digits(c)}`, '.pdf'),
        },
        { entity: c.org, local: 'compliance' },
      )
    },
  },
  {
    id: 'staff-survey',
    phishTypes: ['lookalike', 'linkMismatch', 'replyTo'],
    safeRoute: 'The survey is also listed on the staff intranet.',
    safeNote: 'The survey is also listed on the intranet you already know.',
    build(c, v) {
      return finish(
        c,
        v,
        {
          senderName: `${c.org.short} Human Resources`,
          senderAddress: `hr@${c.org.domain}`,
          subject: 'Staff survey: your voucher',
          request:
            'You have been selected for the staff survey. Complete it in five minutes to receive a canteen voucher.',
          body: [],
          link: linkTo(c.org, 'survey/staff'),
        },
        { entity: c.org, local: 'hr' },
      )
    },
  },
]
