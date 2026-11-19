export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14f1a5" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
      <path
        d="M21.5 11.5a7 7 0 1 0 1.6 6.2"
        fill="none"
        stroke="#0b0d14"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M22.6 7.8v4.4h-4.4" fill="none" stroke="#0b0d14" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS = [
  {
    title: "Scan",
    body: "We list every SPL Token and Token-2022 account in your wallet with a zero balance.",
  },
  {
    title: "Review",
    body: "Pick the accounts to close. You see the exact SOL you get back and the network fee.",
  },
  {
    title: "Claim",
    body: "Approve in your wallet. Each account is closed and its rent is sent back to you.",
  },
];

export function HowItWorks() {
  return (
    <section className="section">
      <h2>How it works</h2>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="step-n">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FAQ = [
  {
    q: "Why is there SOL in my token accounts?",
    a: "Solana charges rent to store data on-chain. Every time you receive a new token, your wallet opens an account for it and deposits a little SOL as rent (about 0.0015 SOL today). When the balance goes to zero, that deposit stays locked until the account is closed.",
  },
  {
    q: "Do you take a fee?",
    a: "No. The transactions only contain close-account instructions that send the rent to your own wallet. You only pay Solana's network fee (0.000005 SOL per transaction). You can check this in your wallet's preview before signing.",
  },
  {
    q: "Will I lose any tokens or NFTs?",
    a: "No. Only accounts with a balance of exactly zero are listed. Accounts that hold anything are never touched.",
  },
  {
    q: "Can I receive that token again later?",
    a: "Yes. If someone sends you that token again, a new account is opened automatically (and the rent is paid again).",
  },
  {
    q: "Why are some accounts skipped?",
    a: "Accounts frozen by the token issuer, accounts whose close authority is another wallet, and Token-2022 accounts with withheld transfer fees can't be closed by you.",
  },
];

export function Faq() {
  return (
    <section className="section">
      <h2>FAQ</h2>
      <div className="faq">
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
