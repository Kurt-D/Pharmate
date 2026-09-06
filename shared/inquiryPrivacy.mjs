// Versioned inquiry disclosure shared by the browser, API, and consent records.
export const INQUIRY_PRIVACY_VERSION = '2026-09-06';
export const INQUIRY_PRIVACY_UPDATED_AT = '2026-09-06';

export const inquiryPrivacy = {
  en: {
    title: 'How inquiry conversations are stored',
    storage:
      'PharMate sends your inquiry subject and messages to its server and stores them in your account’s consultation history. This includes pharmacist replies and completed conversations.',
    access:
      'You and the assigned pharmacist can read the conversation. Before assignment, the selected pharmacist or eligible pharmacists at the selected branch can see your question subject, patient code, priority, and request details. If you choose any branch, eligible pharmacists across branches can see that request.',
    identity:
      'Your patient code replaces your profile name in inquiry screens. It is a pseudonym: PharMate can link it to your account, and anything you type may reveal your identity.',
    retention:
      'Completing a conversation keeps it as read-only history on the server. The current system has no automatic inquiry deletion period or self-service transcript deletion. Logging out or clearing this device does not delete server history.',
    choice:
      'Inquiries are optional. Withdrawing consent stops new inquiries and messages from you, your linked caregiver, and pharmacists. Existing history remains readable. You can still use other PharMate features.',
    operators:
      'These conversations are not end-to-end encrypted. Inquiry subjects and messages are stored as readable text in the database, without the app’s profile-field encryption. System operators with database access, and operators of any database backups, may access stored records. Caregiver and administrator portals do not provide conversation transcript access.',
    device:
      'Conversation messages are loaded from the server when you view them. Custom conversation labels are saved on this device for your account. They are not a local-only copy of the transcript.',
    record:
      'PharMate records your account, the policy version, and the time you grant or withdraw consent. A linked caregiver cannot grant this consent for you; their inquiry submissions require your active consent.',
    contact:
      'For questions about an existing conversation or a request concerning your stored records, contact your pharmacy branch. This screen does not delete records or promise a deletion date.',
    agreement:
      'I consent to central storage and sharing of my inquiry conversations as described here.',
    grant: 'Enable pharmacist inquiries',
    withdraw: 'Withdraw inquiry consent',
    enabled: 'Inquiry consent is active.',
    disabled: 'New inquiries and messages are paused until you consent.',
    policyLink: 'Read the inquiry privacy policy',
  },
  fil: {
    title: 'Paano iniimbak ang mga usapan sa inquiry',
    storage:
      'Ipinapadala ng PharMate sa server ang paksa at mga mensahe mo at iniimbak ang mga ito sa kasaysayan ng konsultasyon ng iyong account. Kasama rito ang mga sagot ng parmasyutiko at mga natapos na usapan.',
    access:
      'Ikaw at ang nakatalagang parmasyutiko ang makakabasa ng usapan. Bago maitalaga, makikita ng napiling parmasyutiko o mga parmasyutikong maaaring tumanggap sa napiling branch ang paksa, patient code, priority, at detalye ng request. Kung anumang branch ang pinili, makikita ang request ng mga parmasyutikong maaaring tumanggap mula sa iba’t ibang branch.',
    identity:
      'Patient code ang ipinapakita kapalit ng pangalan sa inquiry screens. Maiuugnay ito ng PharMate sa iyong account, at maaaring makilala ka mula sa anumang isinusulat mo.',
    retention:
      'Nananatili sa server bilang kasaysayang maaaring basahin ang natapos na usapan. Walang awtomatikong takdang pagbura o self-service na pagbura ng transcript sa kasalukuyang sistema. Hindi nabubura ang kasaysayan sa server kapag nag-log out o nag-clear ng device.',
    choice:
      'Opsyonal ang inquiries. Kapag binawi mo ang pahintulot, hihinto ang bagong inquiry at mga mensahe mula sa iyo, sa nakakonektang caregiver, at sa mga parmasyutiko. Mababasa pa rin ang dating kasaysayan. Magagamit mo pa rin ang ibang bahagi ng PharMate.',
    operators:
      'Hindi end-to-end encrypted ang mga usapang ito. Nakaimbak bilang nababasang teksto sa database ang paksa at mensahe; hindi sakop ang mga ito ng encryption ng profile fields. Maaaring mabasa ang rekord ng system operators na may database access at ng mga namamahala sa anumang database backup. Walang access sa transcript sa caregiver at administrator portals.',
    device:
      'Kinukuha mula sa server ang mga mensahe kapag tinitingnan mo ang mga ito. Sa device na ito naka-save para sa iyong account ang mga custom na label ng usapan. Hindi ito lokal na kopya ng transcript.',
    record:
      'Itinatala ng PharMate ang iyong account, bersiyon ng policy, at oras ng pagbibigay o pagbawi ng pahintulot. Hindi maaaring pumayag para sa iyo ang caregiver; kailangan ang iyong aktibong pahintulot bago sila magpadala ng inquiry.',
    contact:
      'Para sa tanong tungkol sa usapan o request tungkol sa nakaimbak na rekord, makipag-ugnayan sa iyong pharmacy branch. Hindi nagbubura ng rekord o nangangako ng petsa ng pagbura ang screen na ito.',
    agreement:
      'Pumapayag ako sa pag-iimbak sa server at pagbabahagi ng aking mga inquiry gaya ng inilarawan dito.',
    grant: 'Paganahin ang pharmacist inquiries',
    withdraw: 'Bawiin ang pahintulot sa inquiry',
    enabled: 'Aktibo ang pahintulot sa inquiry.',
    disabled: 'Nakahinto ang bagong inquiry at mensahe hanggang pumayag ka.',
    policyLink: 'Basahin ang inquiry privacy policy',
  },
};
