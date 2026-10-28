// private answer data: only the alert reaches the browser before the incident closes
// tier orders a shift from easy to hard; keyLine is the evidence a practice hint highlights and
// hintLookup is the lookup a practice hint points to; entities lists every tappable name in the alert
// steps is the ordered list of containment commands; a decoy has no steps and is answered with dismiss
// lookups maps a normalised lookup command to the lines it prints; nothing here touches a real system
// addresses use the rfc 5737 documentation ranges and internal 10.x lab space; names are fictional

export const RESPONSE_STAGE = 'Containment'

// tier 1 and 2 each hold one decoy, tier 3 is always two ordered steps (see policy.TWO_STEP_INCIDENTS)
export const TIER_PLAN = [
  { tier: 1, count: 3, decoys: 1, twoStep: false },
  { tier: 2, count: 3, decoys: 1, twoStep: false },
  { tier: 3, count: 2, decoys: 0, twoStep: true },
]

export const TOPICS = {
  'firewall-blocking': 'Firewall blocking',
  'account-security': 'Account security',
  'incident-containment': 'Incident containment',
}

export const SCENARIOS = [
  {
    id: 'ssh-brute-force',
    tier: 1,
    keyLine: 1,
    hintLookup: 'whois 203.0.113.45',
    entities: ['lab-gw', '203.0.113.45', '198.51.100.9', '192.0.2.77'],
    concepts: { attack: 'Brute force', cia: ['Confidentiality'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Repeated SSH login failures',
      severity: 'high',
      source: 'Firewall log',
      lines: [
        'lab-gw (10.20.0.1) port 22 saw failed logins in the last 90 seconds',
        'sources seen: 203.0.113.45, 198.51.100.9, 192.0.2.77',
        'no successful sign-in from the attacker side yet',
      ],
    },
    steps: [{ verb: 'block-ip', target: '203.0.113.45' }],
    lookups: {
      'whois 203.0.113.45': [
        'registered to an anonymous hosting provider',
        '412 failed SSH logins in 90 seconds, usernames rotating',
      ],
      'whois 198.51.100.9': [
        'registered to the partner lab VPN',
        '1 failed login then a normal sign-in by a known student',
      ],
      'whois 192.0.2.77': [
        'registered to the campus monitoring service',
        'one port check per minute, allowlisted',
      ],
      'logs lab-gw': [
        'port 22 attempts: 203.0.113.45 x412, 198.51.100.9 x1, 192.0.2.77 x60 (health check)',
      ],
    },
    explanation:
      'One outside address was guessing passwords at machine speed while the other two sources were a normal sign-in and a health check. Blocking the guesser stops the attack; lab-gw is the victim, not the attacker.',
  },
  {
    id: 'web-scanner',
    tier: 1,
    keyLine: 1,
    hintLookup: 'logs portal-web',
    entities: ['portal-web', '198.51.100.23', '203.0.113.8', '192.0.2.140'],
    concepts: { attack: 'Reconnaissance', cia: ['Confidentiality'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Automated vulnerability scan',
      severity: 'medium',
      source: 'Web gateway',
      lines: [
        'portal-web (10.20.0.15) returned many 404 and 403 responses',
        'busy sources: 198.51.100.23, 203.0.113.8, 192.0.2.140',
        'requested paths include /admin, /.env and /backup.zip',
      ],
    },
    steps: [{ verb: 'block-ip', target: '198.51.100.23' }],
    lookups: {
      'logs portal-web': [
        '198.51.100.23: 900 requests/min for /admin, /.env, /backup.zip, all refused',
        '203.0.113.8: 40 requests/min, normal page loads',
        '192.0.2.140: 12 requests/min, search crawler on the allowlist',
      ],
      'whois 198.51.100.23': ['no reverse DNS, listed on a public scanner feed'],
      'whois 203.0.113.8': ['campus visitor Wi-Fi gateway'],
      'whois 192.0.2.140': ['verified search engine crawler'],
    },
    explanation:
      'The probing came from one external scanner and found nothing. Block that scanner; isolating portal-web would take the healthy site offline.',
  },
  {
    id: 'sqli-probe',
    tier: 1,
    keyLine: 1,
    hintLookup: 'logs shop-web',
    entities: ['shop-web', '203.0.113.61', '198.51.100.88', '192.0.2.31'],
    concepts: { attack: 'SQL injection', cia: ['Confidentiality', 'Integrity'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Suspicious database queries',
      severity: 'high',
      source: 'Web application firewall',
      lines: [
        'shop-web (10.20.0.30) logged malformed search requests',
        'clients involved: 203.0.113.61, 198.51.100.88, 192.0.2.31',
        'the database returned errors, no data was exported',
      ],
    },
    steps: [{ verb: 'block-ip', target: '203.0.113.61' }],
    lookups: {
      'logs shop-web': [
        '203.0.113.61: 60 requests containing OR 1=1 and UNION SELECT in the search field',
        '198.51.100.88: ordinary product searches',
        '192.0.2.31: payment provider callback, signature valid',
      ],
      'whois 203.0.113.61': ['rented server, no customer account in our records'],
      'whois 198.51.100.88': ['residential address, repeat customer'],
      'whois 192.0.2.31': ['payment provider webhook range'],
    },
    explanation:
      'Only one client sent injection payloads, and the web application firewall stopped them. Blocking that address ends the probing without disrupting the shop or the payment callback.',
  },
  {
    id: 'scheduled-scan',
    tier: 1,
    keyLine: 1,
    hintLookup: 'whois 192.0.2.50',
    decoy: true,
    entities: ['file-srv', '192.0.2.50'],
    concepts: { attack: 'Reconnaissance', cia: ['Confidentiality'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Port scan against file-srv',
      severity: 'medium',
      source: 'Network sensor',
      lines: [
        '192.0.2.50 touched 1,000 ports on file-srv (10.20.0.40) in 2 minutes',
        'the scan started exactly at 02:00',
        'no exploit traffic followed',
      ],
    },
    steps: [],
    lookups: {
      'whois 192.0.2.50': [
        'registered to the IT department scanner',
        'change ticket CHG-1042: authorised monthly vulnerability scan, 02:00 to 02:30',
      ],
      'logs file-srv': ['scan traffic from 192.0.2.50 only, services unaffected'],
    },
    explanation:
      'The scan matches an authorised change ticket from the IT scanner, so there is nothing to contain. Blocking it would break the monthly audit; the right move is to dismiss the alert and note the ticket.',
  },
  {
    id: 'shift-start-logins',
    tier: 1,
    keyLine: 0,
    hintLookup: 'logs hr-portal',
    decoy: true,
    entities: ['hr-portal', '203.0.113.12'],
    concepts: { attack: 'Brute force', cia: ['Confidentiality'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Burst of failed logins',
      severity: 'medium',
      source: 'Identity provider',
      lines: [
        'hr-portal (10.20.0.55) saw 85 failed logins from 203.0.113.12 at 08:58',
        'each username failed once, then signed in on a second try',
        'the source is a single address',
      ],
    },
    steps: [],
    lookups: {
      'logs hr-portal': [
        '85 users signed in successfully within 90 seconds of the first failure',
        'failures were caps-lock mistakes after the weekend password-policy change',
      ],
      'whois 203.0.113.12': ['campus NAT gateway shared by the staff Wi-Fi'],
    },
    explanation:
      'One shared gateway address hides many real staff, and each failed login was followed by a success. A single block would lock the whole office out; this is noise, so dismiss it.',
  },
  {
    id: 'password-spray',
    tier: 2,
    keyLine: 2,
    hintLookup: 'whois 203.0.113.77',
    entities: ['203.0.113.77', '198.51.100.140', '192.0.2.99', 'trainee-03', 'ops-lee'],
    concepts: { attack: 'Password spraying', cia: ['Confidentiality'] },
    topic: 'firewall-blocking',
    alert: {
      title: 'Password spraying across accounts',
      severity: 'high',
      source: 'Identity provider',
      lines: [
        'one password was tried against many accounts, including trainee-03 and ops-lee',
        'sources: 203.0.113.77, 198.51.100.140, 192.0.2.99',
        '0 successful sign-ins so far',
      ],
    },
    steps: [{ verb: 'block-ip', target: '203.0.113.77' }],
    lookups: {
      'whois 203.0.113.77': ['tried "Spring2026!" against 140 accounts, one attempt each'],
      'whois 198.51.100.140': ['two failed logins for one user, then a reset by the help desk'],
      'whois 192.0.2.99': ['staff VPN exit, 3 users signed in normally'],
      'logs trainee-03': ['1 failed login from 203.0.113.77, no successes'],
    },
    explanation:
      'One address tried a single password across 140 accounts, the classic spray pattern that evades per-account lockouts. No account is compromised, so block the source rather than disabling users.',
  },
  {
    id: 'impossible-travel',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs sales-ana',
    entities: ['sales-ana', 'sales-ben', 'sales-cho', '198.51.100.70'],
    concepts: { attack: 'Account takeover', cia: ['Confidentiality'] },
    topic: 'account-security',
    alert: {
      title: 'Impossible travel sign-in',
      severity: 'high',
      source: 'Identity provider',
      lines: [
        'sales-ana, sales-ben and sales-cho all had far-apart sign-ins today',
        'one sign-in came from 198.51.100.70, minutes after a local sign-in',
        'a mailbox export was started afterwards',
      ],
    },
    steps: [{ verb: 'disable-user', target: 'sales-ana' }],
    lookups: {
      'logs sales-ana': [
        '09:02 sign-in from the office, 09:11 sign-in from 198.51.100.70 abroad',
        '09:14 mailbox export started, MFA prompt never answered',
      ],
      'logs sales-ben': ['two sign-ins, both through the corporate VPN exit'],
      'logs sales-cho': ['phone moved from office Wi-Fi to mobile data, same device'],
      'whois 198.51.100.70': ['anonymising proxy service'],
    },
    explanation:
      'Only sales-ana has a sign-in from a proxy that the person could not have reached, followed by a mailbox export. Disable that account to cut the intruder off; the other two accounts show ordinary network changes.',
  },
  {
    id: 'mail-forwarding-rule',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs fin-sam',
    entities: ['fin-sam', 'fin-ola', 'hr-kim', 'mail-gw'],
    concepts: { attack: 'Business email compromise', cia: ['Confidentiality'] },
    topic: 'account-security',
    alert: {
      title: 'New inbox forwarding rule',
      severity: 'high',
      source: 'Mail gateway',
      lines: [
        'mail-gw logged forwarding rules created today for fin-sam, fin-ola and hr-kim',
        'one rule sends invoices to an outside address and hides the originals',
        'the rule was created seconds after a sign-in from a new device',
      ],
    },
    steps: [{ verb: 'disable-user', target: 'fin-sam' }],
    lookups: {
      'logs fin-sam': [
        'rule "invoices" forwards to an external address and deletes the copy',
        'created from a device never seen before',
      ],
      'logs fin-ola': ['rule forwards to her own phone mailbox inside the company'],
      'logs hr-kim': ['out-of-office rule created from her usual laptop'],
      'logs mail-gw': ['3 rules created today, 1 external'],
    },
    explanation:
      'A rule that silently copies invoices out and deletes the originals is a common sign of a hijacked mailbox. Disable fin-sam; the other two rules are internal and expected.',
  },
  {
    id: 'cryptominer',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs build-runner-1',
    entities: ['build-runner-1', 'build-runner-2', 'test-vm-3', '198.51.100.210'],
    concepts: { attack: 'Cryptojacking', cia: ['Availability'] },
    topic: 'incident-containment',
    alert: {
      title: 'High CPU on build hosts',
      severity: 'medium',
      source: 'Endpoint detection',
      lines: [
        'build-runner-1, build-runner-2 and test-vm-3 are above 90% CPU',
        'outbound connections to 198.51.100.210:3333 were seen',
        'one build script was modified overnight',
      ],
    },
    steps: [{ verb: 'isolate-host', target: 'build-runner-1' }],
    lookups: {
      'logs build-runner-1': [
        'miner process mined.bin running for 6 hours, started by the modified build script',
        'connected to 198.51.100.210:3333 (mining pool)',
      ],
      'logs build-runner-2': ['legitimate compile job for the nightly release, no outside traffic'],
      'logs test-vm-3': ['load test running, scheduled, internal traffic only'],
    },
    explanation:
      'Only build-runner-1 runs the miner and talks to the pool; the other two are busy with legitimate jobs. Isolate that host; blocking the pool address would leave the tampered build script in place.',
  },
  {
    id: 'backup-upload',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs backup-srv',
    decoy: true,
    entities: ['backup-srv', '203.0.113.200'],
    concepts: { attack: 'Data exfiltration', cia: ['Confidentiality'] },
    topic: 'incident-containment',
    alert: {
      title: 'Large outbound upload',
      severity: 'high',
      source: 'Network sensor',
      lines: [
        'backup-srv (10.20.0.70) sent 40 GB to 203.0.113.200 overnight',
        'the transfer ran from 01:00 to 03:00',
        'files were compressed and encrypted',
      ],
    },
    steps: [],
    lookups: {
      'logs backup-srv': [
        'job nightly-offsite finished OK, same schedule every night this year',
        'destination matches the registered offsite backup contract',
      ],
      'whois 203.0.113.200': ['offsite backup provider, contract renewed this quarter'],
    },
    explanation:
      'The size, time and destination all match the registered nightly offsite backup. Isolating backup-srv would stop real backups, so dismiss and keep watching for changes in the pattern.',
  },
  {
    id: 'new-admin-account',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs it-helpdesk',
    decoy: true,
    entities: ['it-helpdesk', 'admin-tmp'],
    concepts: { attack: 'Privilege escalation', cia: ['Integrity'] },
    topic: 'account-security',
    alert: {
      title: 'New administrator account',
      severity: 'high',
      source: 'Directory audit',
      lines: [
        'admin-tmp was created and added to the administrators group',
        'the creator was the it-helpdesk account at 14:05',
        'the account has not signed in yet',
      ],
    },
    steps: [],
    lookups: {
      'logs it-helpdesk': [
        'created by the on-call engineer under ticket INC-7731',
        'ticket asks for a temporary admin for the server migration, expires Friday',
      ],
      'logs admin-tmp': ['unused, expiry date set, MFA required on first sign-in'],
    },
    explanation:
      'A matching ticket, an expiry date and an enforced MFA enrolment show this was planned work. Disabling the account would stall the migration; dismiss it and let the expiry control close the risk.',
  },
  {
    id: 'exec-travel-signin',
    tier: 2,
    keyLine: 1,
    hintLookup: 'logs exec-nia',
    decoy: true,
    entities: ['exec-nia', '198.51.100.120'],
    concepts: { attack: 'Account takeover', cia: ['Confidentiality'] },
    topic: 'account-security',
    alert: {
      title: 'Sign-in from a new country',
      severity: 'high',
      source: 'Identity provider',
      lines: [
        'exec-nia signed in from 198.51.100.120 in a country never used before',
        'the sign-in passed MFA on her enrolled phone',
        'no mailbox rules or downloads followed',
      ],
    },
    steps: [],
    lookups: {
      'logs exec-nia': [
        'travel request approved for this week, conference abroad',
        'same laptop and phone as every other day, MFA approved by her',
      ],
      'whois 198.51.100.120': ['hotel guest Wi-Fi at the conference venue'],
    },
    explanation:
      'A new location alone is not an attack: the trip was approved, the device is the usual one and she approved MFA herself. Disabling her account would strand a traveller, so dismiss the alert.',
  },
  {
    id: 'lateral-movement',
    tier: 3,
    keyLine: 0,
    hintLookup: 'logs kiosk-04',
    entities: ['kiosk-04', 'print-srv', 'hr-laptop-2', 'svc-print', 'hr-ana'],
    concepts: { attack: 'Lateral movement', cia: ['Confidentiality', 'Integrity'] },
    topic: 'incident-containment',
    alert: {
      title: 'Internal SMB sweep',
      severity: 'high',
      source: 'Network sensor',
      lines: [
        'SMB logins to many internal hosts started from kiosk-04, print-srv or hr-laptop-2',
        'a local admin style account was used, candidates: svc-print, hr-ana',
        'the sweep is still running',
      ],
    },
    steps: [
      { verb: 'isolate-host', target: 'kiosk-04' },
      { verb: 'disable-user', target: 'svc-print' },
    ],
    lookups: {
      'logs kiosk-04': [
        'SMB logins to 30 hosts in 4 minutes using svc-print',
        'kiosk-04 normally only talks to print-srv',
      ],
      'logs print-srv': ['receives print jobs from kiosk-04, no outbound SMB'],
      'logs hr-laptop-2': ['3 SMB logins to file-srv by hr-ana, her usual share'],
    },
    explanation:
      'The sweep runs from kiosk-04 with the stolen svc-print credential. Isolate the host first to stop the spread right now, then disable svc-print so the credential cannot be reused from anywhere else.',
  },
  {
    id: 'ransomware-encryption',
    tier: 3,
    keyLine: 0,
    hintLookup: 'logs fin-ws-07',
    entities: ['fin-ws-07', 'fin-ws-08', 'file-srv', '203.0.113.99', '198.51.100.45'],
    concepts: { attack: 'Ransomware', cia: ['Availability', 'Integrity'] },
    topic: 'incident-containment',
    alert: {
      title: 'Files renamed in bulk',
      severity: 'critical',
      source: 'Endpoint detection',
      lines: [
        'thousands of files on file-srv are being renamed to .locked',
        'writes come from one of fin-ws-07 or fin-ws-08',
        'a large upload to 203.0.113.99 or 198.51.100.45 ran just before',
      ],
    },
    steps: [
      { verb: 'isolate-host', target: 'fin-ws-07' },
      { verb: 'block-ip', target: '203.0.113.99' },
    ],
    lookups: {
      'logs fin-ws-07': [
        'process encryptor.exe writing .locked files to the file-srv share',
        'before that, 2 GB was uploaded to 203.0.113.99',
      ],
      'logs fin-ws-08': ['opening spreadsheets on the share, no mass writes'],
      'logs file-srv': ['mass renames come from the fin-ws-07 session only'],
      'whois 203.0.113.99': ['unknown host, receives the uploads from fin-ws-07'],
      'whois 198.51.100.45': ['finance software vendor update server, signed downloads'],
    },
    explanation:
      'Isolate fin-ws-07 first: the encryption is happening now and every second costs files. Then block 203.0.113.99, the staging address that received the stolen copy, so the attacker cannot collect more or reconnect.',
  },
  {
    id: 'c2-beacon',
    tier: 3,
    keyLine: 1,
    hintLookup: 'logs dev-box-09',
    entities: ['dev-box-09', 'dev-box-10', 'dev-kim', 'dev-raj'],
    concepts: { attack: 'Command and control', cia: ['Confidentiality', 'Integrity'] },
    topic: 'incident-containment',
    alert: {
      title: 'Regular outbound beacon',
      severity: 'high',
      source: 'DNS monitor',
      lines: [
        'a developer machine calls an unknown address every 60 seconds',
        'candidates: dev-box-09 or dev-box-10, signed in as dev-kim or dev-raj',
        'the traffic uses an unusual user agent string',
      ],
    },
    steps: [
      { verb: 'isolate-host', target: 'dev-box-09' },
      { verb: 'disable-user', target: 'dev-kim' },
    ],
    lookups: {
      'logs dev-box-09': [
        'beacon to 198.51.100.17 every 60 seconds with a fixed 120-byte payload',
        'signed in as dev-kim since a phishing link was opened at 10:12',
      ],
      'logs dev-box-10': ['package manager updates only, dev-raj signed in'],
      'logs dev-kim': ['cloud tokens were used from dev-box-09 after the beacon began'],
      'whois 198.51.100.17': ['newly registered domain, no business relationship'],
    },
    explanation:
      'The beacon proves dev-box-09 is under remote control. Isolate the host to cut the channel, then disable dev-kim, whose cloud tokens the attacker could now use from elsewhere.',
  },
  {
    id: 'stuffed-vpn-account',
    tier: 3,
    keyLine: 1,
    hintLookup: 'logs vpn-gw',
    entities: ['vpn-gw', 'hr-tan', 'hr-mei', '192.0.2.201', '198.51.100.30'],
    concepts: { attack: 'Credential stuffing', cia: ['Confidentiality'] },
    topic: 'account-security',
    alert: {
      title: 'Successful sign-in after mass failures',
      severity: 'critical',
      source: 'VPN gateway',
      lines: [
        'vpn-gw saw thousands of failed logins, then one success',
        'accounts involved: hr-tan, hr-mei; sources: 192.0.2.201, 198.51.100.30',
        'the successful session is active',
      ],
    },
    steps: [
      { verb: 'disable-user', target: 'hr-tan' },
      { verb: 'block-ip', target: '192.0.2.201' },
    ],
    lookups: {
      'logs vpn-gw': [
        '192.0.2.201 tried 9,000 leaked passwords, one worked for hr-tan',
        'hr-mei and 198.51.100.30: one normal sign-in from the home router',
      ],
      'logs hr-tan': ['active session from 192.0.2.201 started 2 minutes ago, browsing HR files'],
      'whois 192.0.2.201': ['hosting provider with several past abuse reports'],
      'whois 198.51.100.30': ['residential ISP, hr-mei home connection'],
    },
    explanation:
      'The live session belongs to hr-tan, so disable that account first to end the access. Then block 192.0.2.201 so the same stuffing run cannot try other staff passwords from the same source.',
  },
]
