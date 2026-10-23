import type { Idea } from '../types'
import { IMG } from './constants'

/** Curated demo ideas. Phase 2 will generate personalised ones. */
export const IDEAS: Idea[] = [
  { id: 'idea-fairy-lights', title: 'Canopy of fairy lights', description: 'Warm string lights over the reception lawn turn dusk into the main event.', eventTypes: ['wedding', 'birthday'], category: 'decor', cost: 2, image: IMG.weddingBouquet },
  { id: 'idea-long-table', title: 'One long feasting table', description: 'Family-style platters on a single table make guests talk to each other.', eventTypes: ['wedding', 'community'], category: 'food', cost: 2, image: IMG.weddingTable },
  { id: 'idea-wildflower-centrepieces', title: 'Wildflower centrepieces', description: 'Jars of seasonal blooms cost less than formal arrangements and look relaxed.', eventTypes: ['wedding', 'birthday'], category: 'decor', cost: 1, image: IMG.weddingFeast },
  { id: 'idea-ring-moment', title: 'Private ring exchange', description: 'A ten-minute close-family moment before the big ceremony, ideal for portraits.', eventTypes: ['wedding'], category: 'activities', cost: 1, image: IMG.weddingRings },
  { id: 'idea-chef-dinner', title: 'Plated tasting menu', description: 'Small, beautiful courses for an intimate milestone dinner.', eventTypes: ['wedding', 'birthday'], category: 'food', cost: 3, image: IMG.dinner },
  { id: 'idea-balloon-ceiling', title: 'Balloon ceiling', description: 'Hundreds of helium balloons with ribbon tails: instant party, very photogenic.', eventTypes: ['birthday'], category: 'decor', cost: 1, image: IMG.balloons },
  { id: 'idea-dessert-table', title: 'Dessert table with a bold cake', description: 'Layered rainbow cake as the centrepiece, surrounded by mini bakes.', eventTypes: ['birthday'], category: 'food', cost: 2, image: IMG.cake },
  { id: 'idea-chocolate-note', title: 'Hand-lettered plated message', description: 'A chocolate plate with the guest of honour’s name for the final course.', eventTypes: ['birthday', 'wedding'], category: 'favors', cost: 1, image: IMG.birthdayTreats },
  { id: 'idea-sunset-meetup', title: 'Sunset hilltop gathering', description: 'Pick a viewpoint, bring blankets and speakers. Zero venue fee.', eventTypes: ['community', 'birthday'], category: 'venue', cost: 1, image: IMG.communitySunset },
  { id: 'idea-friends-walk', title: 'Community group photo wall', description: 'Print a photo from every past meetup and let people add today’s group shot.', eventTypes: ['community'], category: 'activities', cost: 1, image: IMG.communityFriends },
  { id: 'idea-open-mic', title: 'Open-mic evening', description: 'Stage, two speakers and a sign-up sheet. Volunteers host, neighbours perform.', eventTypes: ['community'], category: 'entertainment', cost: 2, image: IMG.communityHall },
  { id: 'idea-live-band', title: 'Live acoustic set during dinner', description: 'A trio at low volume keeps conversation flowing, then the DJ takes over.', eventTypes: ['wedding', 'birthday', 'community'], category: 'entertainment', cost: 3, image: IMG.weddingFeast },
  { id: 'idea-palette-midnight', title: 'Midnight Garden palette', description: 'Navy, violet and sage. Pairs well with candlelight and greenery.', eventTypes: ['wedding', 'birthday'], category: 'palette', cost: 1, swatches: ['#0b1033', '#7c5cff', '#cfe3d4', '#f4f1ea'] },
  { id: 'idea-palette-festival', title: 'Festival Bright palette', description: 'Marigold, saffron and leaf green: joyful and cheap to source from local markets.', eventTypes: ['community', 'birthday'], category: 'palette', cost: 1, swatches: ['#ff7a1a', '#ffd23f', '#1fa971', '#fff7e6'] },
  { id: 'idea-palette-blush', title: 'Blush & Linen palette', description: 'Soft peach, cream and eucalyptus for daytime ceremonies.', eventTypes: ['wedding'], category: 'palette', cost: 1, swatches: ['#f6d8c0', '#fff7ec', '#9bb59b', '#c2683f'] },
  { id: 'idea-sparkler-send-off', title: 'Sparkler send-off', description: 'Guests line the path with sparklers for the grand exit. Check venue rules first.', eventTypes: ['wedding', 'birthday'], category: 'activities', cost: 1, image: IMG.weddingBouquet },
  { id: 'idea-potluck', title: 'Neighbourhood potluck map', description: 'Guests sign up for a dish on a shared sheet, so the table is varied and costs little.', eventTypes: ['community'], category: 'food', cost: 1, image: IMG.dinner },
]
