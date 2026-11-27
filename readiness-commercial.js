/* Commercial investment readiness scorecard. Questions and points.
   Engine: readiness.js. Points are relative weights; the score is
   total / max x 100. "p: null" = asked for context, not scored. */
(function () {
  "use strict";

  var PRICE = { "Under $1M": 750000, "$1M to $3M": 2000000, "$3M to $10M": 5000000, "$10M or more": 15000000, "Not sure yet": 1500000 };
  var CASH = { "Under $250K": 150000, "$250K to $500K": 375000, "$500K to $1M": 750000, "$1M to $3M": 2000000, "$3M or more": 4000000 };

  window.PC_QUIZ = {
    id: "commercial",
    subject: "Commercial readiness scorecard",
    cats: { capital: "Capital", finance: "Finance", structure: "Structure & team", plan: "Plan & timing", experience: "Experience" },
    questions: [
      { id: "goal", short: "Goal", q: "What are you looking to do?", options: [
        { v: "Buy my first commercial property", p: null },
        { v: "Add commercial to my residential portfolio", p: null },
        { v: "Grow an existing commercial portfolio", p: null },
        { v: "Buy premises for my own business", p: null },
        { v: "Buy through my super fund (SMSF)", p: null }
      ] },
      { id: "price", short: "Price range", q: "Roughly what price range are you looking at?", options: [
        { v: "Under $1M", p: null }, { v: "$1M to $3M", p: null }, { v: "$3M to $10M", p: null },
        { v: "$10M or more", p: null }, { v: "Not sure yet", p: null }
      ] },
      { id: "cash", short: "Cash or equity", cat: "capital", q: "How much cash or useable equity could you put in?",
        help: "Savings, plus equity you could borrow against in property you already own.",
        options: [
          { v: "Under $250K" }, { v: "$250K to $500K" }, { v: "$500K to $1M" }, { v: "$1M to $3M" }, { v: "$3M or more" }
        ],
        derive: function (a) {
          if (!a.cash) return null;
          var need = (PRICE[a.price] || 1500000) * 0.4;     /* ~30 to 35% deposit + ~6% costs */
          var r = CASH[a.cash] / need;
          var p = r >= 1 ? 20 : r >= 0.75 ? 15 : r >= 0.5 ? 9 : r >= 0.25 ? 4 : 1;
          return {
            p: p, max: 20,
            good: "Your cash or equity covers a typical commercial deposit and buying costs for the price range you picked.",
            tip: a.price === "Not sure yet"
              ? "Lock in a price range. Most commercial loans need 30 to 40% down plus around 6% in costs, so your cash sets your ceiling."
              : "Your cash looks light for that price range. Plan on 30 to 40% down plus about 6% in costs, or look at a lower price point, a partner or releasing equity first."
          };
        } },
      { id: "deposit", short: "Knows deposit size", cat: "capital", q: "Did you know most commercial loans need a 30 to 40% deposit, plus about 6% in costs?", options: [
        { v: "Yes, and I've planned for it", p: 6, good: "You've planned for a commercial-sized deposit, which is where most first buyers get caught out." },
        { v: "Yes, but I'm not sure I have enough", p: 3, tip: "Run your numbers through the Commercial Lending calculator to see what deposit each loan type needs." },
        { v: "No, that's news to me", p: 0, tip: "Commercial lending isn't like a home loan. Expect 30 to 40% down plus stamp duty and costs, and plan your cash around that." }
      ] },
      { id: "buffer", short: "Buffer after purchase", cat: "capital", q: "After the deposit and costs, what's left in reserve?", options: [
        { v: "6 months or more of repayments and outgoings", p: 8, good: "You'd have a solid buffer for a vacancy or a slow re-lease." },
        { v: "A few months", p: 4, tip: "Build your buffer towards 6 months. Commercial vacancies can run longer than residential ones." },
        { v: "Not much, the deposit uses it all", p: 0, tip: "Keep a reserve after settlement. A tenant leaving with nothing in the bank is the most common way commercial owners get hurt." }
      ] },
      { id: "finance", short: "Finance", cat: "finance", q: "Where are you up to with finance?", options: [
        { v: "Pre-approved for a commercial loan", p: 12, good: "You have commercial finance approved in principle, so you can move when the right property comes up." },
        { v: "Buying with cash, no loan needed", p: 12, good: "Buying with cash means no lender conditions to meet and a faster settlement." },
        { v: "I've spoken to a broker or lender", p: 7, tip: "Turn that conversation into a written pre-approval so you can make firm offers." },
        { v: "Haven't started yet", p: 2, tip: "Talk to a commercial broker early. Lenders look at the property, the lease and you, and the terms vary a lot between them." }
      ] },
      { id: "income", short: "Income", cat: "finance", q: "How would a lender see your income?", options: [
        { v: "Steady wage or business income, tax returns up to date", p: 10, good: "Up-to-date tax returns and steady income make the lending conversation simple." },
        { v: "Self-employed, returns a year or two behind", p: 5, tip: "Get your tax returns lodged and up to date. Lenders usually want the last two years." },
        { v: "Variable or hard to show on paper", p: 3, tip: "Ask a broker about low-doc or lease-doc options, where the property's rent does more of the work." },
        { v: "Retired or limited income", p: 2, tip: "A strong lease and a lower loan size will matter more than usual. Lease-doc or SMSF lending may suit." }
      ] },
      { id: "debts", short: "Other debts and credit", cat: "finance", q: "How do your other debts and credit history look?", options: [
        { v: "Clean credit, not much other debt", p: 8, good: "Clean credit and low other debt keep more lenders open to you." },
        { v: "Some debts, all comfortably manageable", p: 6 },
        { v: "Fairly heavily borrowed already", p: 2, tip: "Your existing debt may limit new lending. A portfolio review could free up equity or show what to restructure first." },
        { v: "Some credit issues in the past", p: 1, tip: "Get a copy of your credit file and talk to a broker about which lenders will look past it." }
      ] },
      { id: "entity", short: "Buying entity", cat: "structure", q: "Who would own the property?", options: [
        { v: "A company or trust that's already set up", p: 6, good: "Your buying entity is already in place, so there's nothing to set up before you sign." },
        { v: "My super fund (SMSF), already set up", p: 6, good: "Your SMSF is set up and ready, which opens up business premises and strong-lease buys." },
        { v: "My own name", p: 4, tip: "Check with your accountant whether your own name is the right owner. Tax, land tax and asset protection all change with the structure." },
        { v: "Not sure yet", p: 1, tip: "Decide the ownership structure with your accountant before you make offers. Changing it after signing can mean paying stamp duty twice." }
      ] },
      { id: "team", short: "Team in place", cat: "structure", type: "check", q: "Who's already on your team?",
        help: "Tick any you have. Leave it blank if none yet.", max: 10,
        good: "Your core team is in place, so due diligence can move quickly.",
        tip: "Line up the gaps in your team before you find the property: {missing}.",
        options: [
          { v: "A finance broker or lender", short: "a broker", p: 3 },
          { v: "An accountant", short: "an accountant", p: 3 },
          { v: "A property solicitor or conveyancer", short: "a solicitor", p: 2 },
          { v: "A commercial property adviser", short: "an adviser", p: 2 }
        ] },
      { id: "experience", short: "Experience", cat: "experience", q: "What property do you own today?", options: [
        { v: "I already own commercial property", p: 8, good: "You've owned commercial before, so leases, outgoings and vacancies aren't new to you." },
        { v: "Residential investment property", p: 6, good: "You've already held an investment property, which gives you a head start." },
        { v: "Just my home", p: 3, tip: "Read a few commercial leases before you buy. The lease, not the building, is most of what you're paying for." },
        { v: "None yet", p: 1, tip: "Start smaller and simpler: a single tenant on a long lease is an easier first commercial property than a multi-tenant building." }
      ] },
      { id: "brief", short: "Clear brief", cat: "plan", q: "How clear is what you want to buy?", options: [
        { v: "Clear brief: type, location, yield and lease length", p: 7, good: "You know exactly what you're looking for, which makes it easy to say no to the wrong deals." },
        { v: "A rough idea", p: 4, tip: "Write down a one-page brief: property type, location, minimum yield, lease length and tenant quality." },
        { v: "Still exploring", p: 1, tip: "Pick one property type and one area to start with. A tight brief beats a wide search." }
      ] },
      { id: "timeframe", short: "Timeframe", cat: "plan", q: "When would you like to buy?", options: [
        { v: "Ready now", p: 6, good: "You're ready to move now." },
        { v: "In 1 to 3 months", p: 6, good: "Your timing is close, so getting finance and structure locked in now pays off." },
        { v: "In 3 to 6 months", p: 4 },
        { v: "In 6 to 12 months", p: 2 },
        { v: "More than a year away", p: 1 }
      ] }
    ],
    bands: [
      { min: 80, label: "Ready to buy",
        lead: "You're in a strong position. Your capital, finance and structure line up, and lenders will see you as a serious buyer.",
        next: "Get specific about the property. Send me your brief and I'll tell you honestly how it looks against what's on the market right now." },
      { min: 60, label: "Nearly there",
        lead: "Most of the pieces are in place. A couple of gaps could slow you down or cost you a good deal when it comes up.",
        next: "Close the gaps below first, then you'll be able to move quickly. Happy to talk through which one to tackle first." },
      { min: 40, label: "Getting closer",
        lead: "You've got some foundations, but there's work to do on capital, finance or structure before you're ready to make offers.",
        next: "Work through the list below. Running your numbers through the Commercial Lending calculator is a good first step." },
      { min: 0, label: "Early days",
        lead: "You're at the start, which is the best time to get the setup right. Most expensive mistakes in commercial property happen before the contract is signed.",
        next: "Start with a broker and an accountant, then build your deposit and a clear brief. If you'd like a sounding board along the way, get in touch." }
    ],
    ctas: [
      { href: "enquire", label: "Talk it through with me" },
      { href: "commercial-lending-calculator", label: "Commercial Lending calculator", ghost: true }
    ]
  };
})();
