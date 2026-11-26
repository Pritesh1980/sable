// In-app Help (#220 I): a short How-do-I list. Each answer is two to four short
// lines; the detail lives in docs/ only, and `guide` names the docs heading
// (file#GitHub-anchor) that holds it. `image` is a file in public/guide/.
// src/test/helpTopics.test.js keeps the answers short and the links real.

export const GUIDE_BASE = 'https://github.com/Pritesh1980/sable/blob/main/docs/'

export function guideUrl(guide) {
  return `${GUIDE_BASE}${guide}`
}

export const HELP_GROUPS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    topics: [
      {
        id: 'get-around',
        question: 'How do I get around?',
        steps: [
          'Home shows your top artists, ideas and concepts, and one suggested next step.',
          'The bar along the bottom (along the top on a laptop) has Home, Artists, Ideas, AI and More.',
          'More holds Find (Plan, Radar, Studios) and App (Settings, Help).',
          'Artists opens on the Wall. Strip, Compare and Grid show one card per artist: tap a card to open their page.',
        ],
        image: 'nav-more.png',
        guide: '01-getting-started.md#moving-around',
      },
    ],
  },
  {
    id: 'artists',
    label: 'Artists and photos',
    topics: [
      {
        id: 'add-artist',
        question: 'How do I add an artist?',
        steps: [
          'Artists → + Add.',
          'Attach screenshots: Choose files, drop them in, or tap Paste.',
          'Type their Instagram handle or profile link, then tap Save.',
          'Already saved? Drag a photo onto their tile on the Wall, or paste (⌘V) while their photo is open.',
        ],
        image: 'artist-capture.png',
        guide: '02-managing-artists.md#add-an-artist--the-quick-way',
      },
      {
        id: 'no-artist',
        question: 'How do I save a photo when I don’t know the artist?',
        steps: [
          'Artists → + Add, attach the photo, and tap Save without artist.',
          'It goes to the front of the Wall, marked No artist yet.',
          'Once you know who made it, open it and tap Give this an artist.',
        ],
        guide: '02-managing-artists.md#save-a-photo-without-an-artist',
      },
      {
        id: 'viewer',
        question: 'How do I look through photos?',
        steps: [
          'Tap any photo on the Wall and it fills the screen.',
          'On a phone, swipe left or right for this artist’s photos, up for the next artist, and down to close.',
          'On a laptop, use the arrow keys, and Esc to close.',
          'For the artist’s notes and tools, tap the photo (or More) on a phone, or press I on a laptop.',
        ],
        image: 'wall-viewer.png',
        guide: '01-getting-started.md#the-full-screen-viewer--one-click-in',
      },
      {
        id: 'favourite',
        question: 'How do I keep the photos I like best?',
        steps: [
          'Open a photo and tap the heart (F on a laptop).',
          'Tap Filter, then Favourites, to see only those photos.',
        ],
        guide: '02-managing-artists.md#favourite-a-photo',
      },
      {
        id: 'similar',
        question: 'How do I find work like a photo I like?',
        steps: [
          'Open the photo and tap More like this. On a phone, tap the photo first to show the panel; on a laptop, press M.',
          'It shows the three closest artists, then the most similar photos.',
          'The first time, tap Build style index. It runs on this device, and your photos never leave it.',
          'To see one style on the Wall, tap Filter and pick it.',
        ],
        guide: '02-managing-artists.md#more-like-this',
      },
      {
        id: 'search',
        question: 'How do I find photos of a skull, a wolf or a face?',
        steps: [
          'Tap Tools, then Search, on the Artists page and type one subject.',
          'Matches come back grouped by artist. Tap one to open it.',
          'The first search downloads a 67 MB model, once. It runs on this device.',
        ],
        guide: '02-managing-artists.md#search-your-photos',
      },
      {
        id: 'tidy',
        question: 'How do I tidy up photos that look wrong or were added twice?',
        steps: [
          'Build the style index once, from More like this.',
          'In Tools, then Manage, a row shows “1 photo to check” when a photo looks unlike the rest.',
          'Open the row and choose Keep or Remove. It may also suggest a style tag.',
          'More → Settings → Duplicate photos finds photos added more than once. You choose which copy goes.',
        ],
        guide: '02-managing-artists.md#tidy-up-hints',
      },
      {
        id: 'rank',
        question: 'What does rank do, and how do I set it?',
        steps: [
          'Rank is one list of every artist. It sets your Top 5 and the Artists order, breaks ties in artist suggestions, and weights your taste.',
          'On the Wall, drag a rank number in the Top 5, or tap Reorder top 5 for ▲ and ▼ on everyone.',
          'Tools → Rank shows artists one at a time: Top puts them at the front, Pass at the back. Nobody is removed.',
          'All of these change the same list.',
        ],
        image: 'ranking-intro.png',
        guide: '03-gallery-and-ranking.md#ranking-your-favourites',
      },
    ],
  },
  {
    id: 'ideas-ai',
    label: 'Ideas and AI',
    topics: [
      {
        id: 'idea',
        question: 'How do I write down a tattoo idea?',
        steps: [
          'Ideas → +.',
          'Give it a title, styles, a placement and reference photos, then tap Add.',
          'Artists with matching styles appear in the editor: tap one to link them.',
          'Share as image makes a card to send an artist. The Boards tab groups ideas together.',
        ],
        image: 'brief-idea-editor.png',
        guide: '04-brief-and-boards.md#create-or-edit-an-idea',
      },
      {
        id: 'plan',
        question: 'Which artist should do my idea?',
        steps: [
          'More → Plan lists each open idea with up to three of your artists.',
          'Artists you linked come first, then those sharing the most styles, then your rank.',
          'A pin means they have a guest spot nearby soon.',
          'Add an artist’s trips under Guest spots on their page.',
        ],
        image: 'plan.png',
        guide: '01-getting-started.md#the-plan-page',
      },
      {
        id: 'concept',
        question: 'How do I make an AI design?',
        steps: [
          'AI → + New concept. Or press G on an open photo to work in that artist’s style.',
          'Describe your idea and pick a placement.',
          'Generate image needs your own OpenAI or Gemini key, added in AI setup.',
          'No key? Tap Copy prompt instead, run it in ChatGPT or Gemini, then paste the image back in.',
        ],
        image: 'concepts.png',
        guide: '06-concepts.md#the-composer',
      },
      {
        id: 'try-on',
        question: 'How do I see a design on my arm?',
        steps: [
          'On an AI result with an image, choose View on arm in 3D. From an idea, tap On arm on a reference photo.',
          'Drag to turn the arm and pinch to resize; the size shows in centimetres.',
          'Or choose Try on skin, then Live camera, to see it over your camera view.',
        ],
        image: 'concept-arm.png',
        guide: '06-concepts.md#see-a-concept-on-the-arm-in-3d',
      },
      {
        id: 'print',
        question: 'How do I 3D print a design?',
        steps: [
          'On an AI result with an image, choose Make STL. From an idea, tap 3D print on a reference photo.',
          'Pick a style, check the 3D preview, then tap Download.',
          'From a photo of a real tattoo, Lift the tattoo (needs a Gemini key) redraws the ink flat first.',
        ],
        guide: '06-concepts.md#export-a-relief-stl',
      },
    ],
  },
  {
    id: 'shows-library',
    label: 'Shows and your library',
    topics: [
      {
        id: 'conventions',
        question: 'Which conventions are my artists going to?',
        steps: [
          'More → Radar lists conventions, nearest to Milton Keynes first. On a card, tap Edit to mark who is going.',
          'The card then says whether the trip is worth it. Artist index lists the line-up; Top picks can show a walking order.',
          'Offline pack saves those artists, their photos and linked ideas on this phone, to open at the show with no signal.',
        ],
        image: 'conventions.png',
        guide: '05-conventions-and-studios.md#convention-radar',
      },
      {
        id: 'backup',
        question: 'How do I back up my library?',
        steps: [
          'More → Settings → Export Backup downloads one file with your artists, ideas, concepts and photos. Keep a copy off this device.',
          'If it says some photos couldn’t be read, reconnect and export again.',
          'Import Backup restores a file, replacing what is here now.',
          'Unless your Sable is set up for cloud sync, your library lives only on this device.',
        ],
        image: 'settings.png',
        guide: '07-backup-and-settings.md#export-a-backup',
      },
    ],
  },
]
