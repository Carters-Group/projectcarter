/* Development readiness scorecard. Questions and points.
   Engine: readiness.js. Points are relative weights; the score is
   total / max x 100. "p: null" = asked for context, not scored. */
(function () {
  "use strict";

  /* Rough equity a lender will want in, by project size (land + 20 to 35% of costs) */
  var NEED = {
    "A small project: duplex or 2 to 4 townhouses": 500000,
    "A medium project: 5 to 20 homes": 1500000,
    "A large project: 20+ homes or apartments": 5000000,
    "Commercial or mixed use": 3000000,
    "Not sure yet": 1000000
  };
  var CASH = { "Under $250K": 150000, "$250K to $500K": 375000, "$500K to $1M": 750000, "$1M to $3M": 2000000, "$3M to $10M": 6000000, "$10M or more": 15000000 };

  window.PC_QUIZ = {
    id: "development",
    subject: "Development readiness scorecard",
    cats: { site: "Site & planning", capital: "Capital", finance: "Numbers & finance", team: "Experience & team", plan: "Structure & timing" },
    questions: [
      { id: "type", short: "Project type", q: "What kind of development are you thinking about?", options: [
        { v: "A small project: duplex or 2 to 4 townhouses", p: null },
        { v: "A medium project: 5 to 20 homes", p: null },
        { v: "A large project: 20+ homes or apartments", p: null },
        { v: "Commercial or mixed use", p: null },
        { v: "Not sure yet", p: null }
      ] },
      { id: "site", short: "Site", cat: "site", q: "Where are you up to with a site?", options: [
        { v: "I own a site", p: 12, good: "You already control a site, which is the hardest part for most new developers." },
        { v: "Under contract or option", p: 10, good: "You have a site under contract or option, so you can do your due diligence before you're fully committed." },
        { v: "Looking at specific sites", p: 5, tip: "Run every site you're looking at through a quick feasibility before you make an offer. The numbers decide the price, not the agent." },
        { v: "Haven't started looking", p: 1, tip: "Decide what you'll build and where before you look. Then search for sites that suit that plan, not the other way round." }
      ] },
      { id: "cash", short: "Cash or equity", cat: "capital", q: "How much cash or useable equity could you put in?",
        help: "Savings, equity in property you own, and any land you'd contribute.",
        options: [
          { v: "Under $250K" }, { v: "$250K to $500K" }, { v: "$500K to $1M" }, { v: "$1M to $3M" }, { v: "$3M to $10M" }, { v: "$10M or more" }
        ],
        derive: function (a) {
          if (!a.cash) return null;
          var r = CASH[a.cash] / (NEED[a.type] || 1000000);
          var p = r >= 1 ? 20 : r >= 0.75 ? 15 : r >= 0.5 ? 9 : r >= 0.25 ? 4 : 1;
          return {
            p: p, max: 20,
            good: "Your cash or equity looks right for the size of project you picked.",
            tip: a.type === "Not sure yet"
              ? "Pick a project size. Development lenders usually want the land plus 20 to 35% of the costs in equity, so your capital sets the scale."
              : "Your equity looks light for that size of project. Start smaller, bring in a capital partner, or look at a joint venture on the land."
          };
        } },
      { id: "holding", short: "Holding power", cat: "capital", q: "Could you carry the holding costs while approvals run?",
        help: "Interest, rates, insurance and consultants, often for 12 months or more before construction starts.",
        options: [
          { v: "Yes, comfortably for 12 to 24 months", p: 8, good: "You can carry the site while approvals take their time, so you won't be forced into a bad deal." },
          { v: "For 6 to 12 months", p: 4, tip: "Approvals often take longer than planned. Build 12 months or more of holding costs into your budget." },
          { v: "It would be tight", p: 1, tip: "Holding costs sink more first developments than construction does. Look at an option or a JV so you're not carrying the land alone." }
        ] },
      { id: "contingency", short: "Contingency", cat: "capital", q: "Have you allowed for costs running over?", options: [
        { v: "Yes, 10% or more contingency built in", p: 6, good: "You've built in a proper contingency, which is what keeps a project alive when the surprises come." },
        { v: "A small allowance", p: 3, tip: "Lift your contingency to at least 10% of construction. Lenders will usually ask for it anyway." },
        { v: "Haven't thought about it", p: 0, tip: "Every project has surprises. Allow at least 10% of build costs as contingency in your feasibility." }
      ] },
      { id: "feaso", short: "Feasibility", cat: "finance", q: "Have you run a feasibility on it?", options: [
        { v: "Yes, a full feaso with costed numbers", p: 10, good: "You have a costed feasibility, so you know your margin before you commit." },
        { v: "Rough numbers on the back of an envelope", p: 5, tip: "Turn your rough numbers into a full feasibility: land, approvals, build, finance, selling costs and GST. The Development Site and GRV calculators do most of it." },
        { v: "Not yet", p: 1, tip: "Run a feasibility before anything else. If the margin isn't there on paper, it won't be there on site." }
      ] },
      { id: "finance", short: "Finance", cat: "finance", q: "Where are you up to with finance?", options: [
        { v: "Spoken to a development lender", p: 10, good: "You've already had the development finance conversation, so you know what a lender will want to see." },
        { v: "A capital or JV partner is lined up", p: 9, good: "You have a capital partner lined up, which takes pressure off the equity side." },
        { v: "Spoken to a broker in general", p: 6, tip: "Get in front of a development lender with your feasibility. Their pre-sale and equity requirements shape the whole project." },
        { v: "Haven't started yet", p: 1, tip: "Talk to a development lender early. Their requirements on equity, pre-sales and experience decide what you can build." }
      ] },
      { id: "planning", short: "Planning", cat: "site", q: "Do you know what council will let you build?", options: [
        { v: "Approval (DA) is already in place", p: 10, good: "You already have an approval, which removes the biggest single risk in development." },
        { v: "I've checked the zoning and it suits", p: 6, tip: "Get a town planner's view next. Zoning is the start; overlays, setbacks and parking decide what actually fits." },
        { v: "Not checked yet", p: 1, tip: "Check the zoning and overlays before anything else. A pre-lodgement meeting with council is cheap and tells you a lot." }
      ] },
      { id: "experience", short: "Experience", cat: "team", q: "What have you done before?", options: [
        { v: "I've completed developments myself", p: 12, good: "You've delivered projects before, which lenders and partners weight heavily." },
        { v: "Renovations, a subdivision or a small build", p: 8, good: "You've managed works before, which is a good stepping stone into development." },
        { v: "Owned investment property", p: 4, tip: "Lenders look for development experience. Start with a smaller project, or partner with someone who has a track record." },
        { v: "Nothing yet", p: 1, tip: "Partner with an experienced developer for your first one. You'll learn on someone else's track record and lenders will take you more seriously." }
      ] },
      { id: "team", short: "Team in place", cat: "team", type: "check", q: "Who's already on your team?",
        help: "Tick any you have. Leave it blank if none yet.", max: 10,
        good: "Your consultant team is mostly in place, so the project won't stall waiting on people.",
        tip: "Fill the gaps in your team before you commit to a site: {missing}.",
        options: [
          { v: "Town planner", short: "a town planner", p: 2 },
          { v: "Architect or building designer", short: "an architect", p: 2 },
          { v: "Builder", short: "a builder", p: 2 },
          { v: "Quantity surveyor", short: "a quantity surveyor", p: 1 },
          { v: "Development lender or broker", short: "a development lender", p: 2 },
          { v: "Accountant", short: "an accountant", p: 1 }
        ] },
      { id: "involvement", short: "Involvement", cat: "team", q: "How involved do you want to be?", options: [
        { v: "Hands-on, I'll run it myself", p: 5 },
        { v: "Involved, with a delivery partner running it", p: 5, good: "Pairing your capital or site with a delivery partner is how most first developments get done well." },
        { v: "Part-time, around my work", p: 3, tip: "Development is close to a full-time job at key stages. Line up a project manager or delivery partner." },
        { v: "Capital only, someone else runs it", p: 3, tip: "If you want to stay passive, look at a joint venture where an experienced developer runs delivery and shares the upside." }
      ] },
      { id: "entity", short: "Development entity", cat: "plan", q: "Who would own the project?", options: [
        { v: "A company or trust set up just for this project", p: 6, good: "A dedicated project entity keeps the development ring-fenced, which lenders and partners like." },
        { v: "An existing company or trust", p: 5, tip: "Ask your accountant whether a separate project company would better protect your other assets." },
        { v: "My own name", p: 2, tip: "Developing in your own name can mean extra tax and personal risk. Talk to your accountant about a project company or trust." },
        { v: "Not sure yet", p: 1, tip: "Settle the structure with your accountant before you buy the site. GST, tax and stamp duty all depend on it." }
      ] },
      { id: "timeframe", short: "Timeframe", cat: "plan", q: "When would you like to get started?", options: [
        { v: "Ready now", p: 6, good: "You're ready to move now." },
        { v: "In 1 to 3 months", p: 6, good: "Your timing is close, so locking in the team and finance now pays off." },
        { v: "In 3 to 6 months", p: 4 },
        { v: "In 6 to 12 months", p: 2 },
        { v: "More than a year away", p: 1 }
      ] }
    ],
    bands: [
      { min: 80, label: "Ready to develop",
        lead: "You're well set up. Site, capital, numbers and team line up, and a lender will see you as a credible developer.",
        next: "Send me the site or the plan and I'll give you a straight view on the numbers and the planning path." },
      { min: 60, label: "Nearly there",
        lead: "The foundations are strong. A few gaps could cost you time or margin once you're committed.",
        next: "Close the gaps below before you lock in a site. Happy to talk through which one matters most." },
      { min: 40, label: "Getting closer",
        lead: "There's a real base here, but capital, planning or experience gaps would make a lender cautious right now.",
        next: "Work through the list below, or think about a joint venture where an experienced developer covers the gaps." },
      { min: 0, label: "Early days",
        lead: "You're at the start. That's the right time to learn, because the biggest development mistakes happen at the site purchase.",
        next: "Run a feasibility on a real site, talk to a planner and a lender, and look at partnering on your first project." }
    ],
    ctas: [
      { href: "enquire", label: "Talk it through with me" },
      { href: "development-site-calculator", label: "Development Site calculator", ghost: true },
      { href: "partner", label: "How partnerships work", ghost: true }
    ]
  };
})();
