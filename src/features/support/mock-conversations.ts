type Channel = 'Slack' | 'LINE' | 'Gmail'

export type Conversation = {
  id: string
  name: string
  role: string
  subject: string
  channels: Channel[]
  replyChannel: Channel
  updatedAt: string
  deadline?: string
  summary: string
  nextStep: string
  messages: {
    id: string
    channel: Channel
    text: string
    time: string
    direction: 'in' | 'out'
  }[]
  facts: { text: string; sourceId: string }[]
  drafts: { label: string; text: string }[]
  scheduleOptions: string[]
}

// All contacts, conversations and proposed appointments are fictional UI samples.
export const conversations: Conversation[] = [
  {
    id: 'design-review',
    name: '青木 遥',
    role: 'プロダクトデザイナー',
    subject: '来週のレビュー、日程を決める',
    channels: ['Slack', 'Gmail'],
    replyChannel: 'Slack',
    updatedAt: '10:42',
    deadline: '9月29日 17:00',
    summary:
      '新しい画面のレビュー依頼。資料はメールで届いていて、Slackで日程の返事を待っている。30分あればよい。',
    nextStep: '資料を確認して、30分の候補日時を返す。',
    messages: [
      {
        id: 'aoki-1',
        channel: 'Gmail',
        time: '9月27日 16:20',
        direction: 'in',
        text: 'レビュー用の画面案を共有します。特に初回の導線について意見を聞きたいです。確認のお時間は30分ほどを想定しています。',
      },
      {
        id: 'aoki-2',
        channel: 'Slack',
        time: '9月28日 10:42',
        direction: 'in',
        text: '昨日メールしたレビューの件、来週どこかでお時間いただけますか？ 9月29日17時までに候補をいただけると助かります。午後だとうれしいです。',
      },
    ],
    facts: [
      { text: 'レビューは30分を想定している。', sourceId: 'aoki-1' },
      { text: '今回の日程は午後を希望している。', sourceId: 'aoki-2' },
    ],
    drafts: [
      {
        label: '短く',
        text: '資料ありがとうございます。確認します！ 来週の午後で、30分ほどお話しできればと思います。',
      },
      {
        label: '丁寧に',
        text: '資料をご共有いただきありがとうございます。初回の導線を中心に確認いたします。来週の午後に30分ほどお時間をいただけますでしょうか。',
      },
      {
        label: 'まず受け取る',
        text: 'ご連絡ありがとうございます。資料、受け取りました。日程を確認して9月29日17時までにお返事します。',
      },
    ],
    scheduleOptions: ['10月5日（月）14:00–14:30', '10月6日（火）15:00–15:30'],
  },
  {
    id: 'weekend-coffee',
    name: '森 直人',
    role: '友人',
    subject: '久しぶりに、お茶でも',
    channels: ['LINE'],
    replyChannel: 'LINE',
    updatedAt: '昨日',
    summary:
      '近くに来るのでお茶をしようという誘い。急ぎの返事は求められていない。',
    nextStep: '会いたければ都合を返す。今決めなくてもよい。',
    messages: [
      {
        id: 'mori-1',
        channel: 'LINE',
        time: '9月27日 19:15',
        direction: 'in',
        text: '来週そっちの方に行くかも。時間合ったらお茶しない？ 土曜の午後なら空いてる。急ぎじゃないので、予定わかったら！',
      },
    ],
    facts: [{ text: '今回は土曜の午後が空いている。', sourceId: 'mori-1' }],
    drafts: [
      {
        label: '短く',
        text: 'いいね、久しぶりに会いたい！ 土曜の午後で予定見てみるね。',
      },
      {
        label: '丁寧に',
        text: '誘ってくれてありがとう！ ぜひお茶したいです。土曜の午後、都合を確認して連絡するね。',
      },
      {
        label: 'まず受け取る',
        text: 'ありがとう！ まだ予定が見えないので、わかったら連絡するね。',
      },
    ],
    scheduleOptions: ['10月3日（土）14:00–15:00', '10月3日（土）16:00–17:00'],
  },
  {
    id: 'estimate-check',
    name: '藤井 理沙',
    role: '制作パートナー',
    subject: '見積もりの前提を確認する',
    channels: ['Gmail'],
    replyChannel: 'Gmail',
    updatedAt: '9:10',
    deadline: '9月30日 12:00',
    summary:
      '見積もりを進めるため、対象画面が3画面でよいか確認が届いている。回答期限は9月30日の正午。',
    nextStep: '対象画面数を確認して返答する。未確認のまま確約しない。',
    messages: [
      {
        id: 'fujii-1',
        channel: 'Gmail',
        time: '9月28日 9:10',
        direction: 'in',
        text: '概算の作成にあたり、対象は一覧・詳細・設定の3画面という理解でよろしいでしょうか。9月30日正午までにご確認いただければ、同日中にお見積もりをお送りします。',
      },
    ],
    facts: [
      { text: '対象画面数の確認後に概算を作成する予定。', sourceId: 'fujii-1' },
    ],
    drafts: [
      {
        label: '短く',
        text: 'ありがとうございます。対象の3画面について確認し、9月30日正午までにお返事します。',
      },
      {
        label: '丁寧に',
        text: 'ご確認ありがとうございます。一覧・詳細・設定の3画面で相違ないか確認のうえ、9月30日正午までに回答いたします。',
      },
      {
        label: 'まず受け取る',
        text: 'ご連絡を受け取りました。対象範囲を確認して、改めてご連絡します。',
      },
    ],
    scheduleOptions: [],
  },
  {
    id: 'reading-note',
    name: '田辺 悠',
    role: '勉強会の仲間',
    subject: '前に話していた記事',
    channels: ['Slack'],
    replyChannel: 'Slack',
    updatedAt: '金曜日',
    summary:
      '前の勉強会で話題になった記事を共有してくれた。質問や返答の依頼はない。',
    nextStep: '読む時間がなければ、返信せず閉じてよい。',
    messages: [
      {
        id: 'tanabe-1',
        channel: 'Slack',
        time: '9月25日 18:30',
        direction: 'in',
        text: '前に話していた、道具を増やさず仕事を進める話の記事を見つけたので共有！ 時間あるときにどうぞ。返信不要です。',
      },
    ],
    facts: [
      { text: 'この共有への返信は不要と明記している。', sourceId: 'tanabe-1' },
    ],
    drafts: [
      { label: '短く', text: '共有ありがとう！ あとで読んでみるね。' },
      {
        label: '丁寧に',
        text: '覚えていてくれてありがとう。ちょうど気になっていた話なので、時間を取って読んでみます。',
      },
      { label: 'まず受け取る', text: 'ありがとう、受け取りました！' },
    ],
    scheduleOptions: [],
  },
]
