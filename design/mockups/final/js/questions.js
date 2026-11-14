const keep = q => (q.get('sky') ? `&sky=${q.get('sky')}` : '');
const SETS = {
  phq9: {
    stem: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    dots: true,
    options: [
      { v: 0, label: 'Not at all', aria: 'Not at all, 0 of 3' },
      { v: 1, label: 'Several days', aria: 'Several days, 1 of 3' },
      { v: 2, label: 'More than half the days', aria: 'More than half the days, 2 of 3' },
      { v: 3, label: 'Nearly every day', aria: 'Nearly every day, 3 of 3' },
    ],
    items: [
      { key: 'phq9_1', text: 'Little interest or pleasure in doing things' },
      { key: 'phq9_2', text: 'Feeling down, depressed, or hopeless' },
      { key: 'phq9_3', text: 'Trouble falling or staying asleep, or sleeping too much' },
      { key: 'phq9_4', text: 'Feeling tired or having little energy' },
      { key: 'phq9_5', text: 'Poor appetite or overeating' },
      { key: 'phq9_6', text: 'Feeling bad about yourself - or that you are a failure or have let yourself or your family down' },
      { key: 'phq9_7', text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
      { key: 'phq9_8', text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual' },
      { key: 'phq9_9', text: 'Thoughts that you would be better off dead or of hurting yourself in some way' },
    ],
    next(n, v, q) {
      if (n < 9) return `question.html?q=${n + 1}${keep(q)}`;
      return v >= 1 ? `checkin-intro.html?v=cssrs${keep(q)}` : `done.html?v=thanks${keep(q)}`;
    },
  },
  cssrs: {
    stem: null,
    dots: false,
    options: [
      { v: 1, label: 'Yes', aria: 'Yes' },
      { v: 0, label: 'No', aria: 'No' },
    ],
    items: [
      { key: 'cssrs_1', header: 'In the past month:', text: 'Have you wished you were dead or wished you could go to sleep and not wake up?' },
      { key: 'cssrs_2', header: 'In the past month:', text: 'Have you actually had any thoughts of killing yourself?' },
      { key: 'cssrs_3', header: 'In the past month:', text: 'Have you thought about how you might do this? (For example, “I thought about taking an overdose but I never worked out the details about when, where, and how I would do that and I would never act on these thoughts.”)' },
      { key: 'cssrs_4', header: 'In the past month:', text: 'Have you had any intention of acting on these thoughts of killing yourself, as opposed to you have the thoughts, but you definitely would not act on them? (For example, “I had the thought of killing myself by taking an overdose and am not sure whether I would do it or not.”)' },
      { key: 'cssrs_5', header: 'In the past month:', text: 'Have you started to work out, or actually worked out, the specific details of how to kill yourself and did you actually intend to carry out the details of your plan? (For example, “I am planning to take 3 bottles of my sleep medication this Saturday when no one is around to stop me.”)' },
      { key: 'cssrs_6', header: null, text: 'Have you ever done anything, started to do anything, or prepared to do anything to end your life? (For example: Took pills, tried to shoot yourself, cut yourself, tried to hang yourself, took out pills but didn’t swallow any, held a gun but changed your mind about hurting yourself or it was grabbed from your hand, went to the roof to jump but didn’t, collected pills, obtained a gun, gave away valuables, wrote a will or suicide note; etc.)' },
      { key: 'cssrs_6b', header: null, text: 'If YES, did this occur in the past 3 months?' },
    ],
    next(n, v, q) {
      if (n === 2 && v === 0) return `question.html?set=cssrs&q=6${keep(q)}`;
      if (n < 6) return `question.html?set=cssrs&q=${n + 1}${keep(q)}`;
      if (n === 6 && v === 1) return `question.html?set=cssrs&q=7${keep(q)}`;
      return `crisis.html?v=support`;
    },
  },
};
