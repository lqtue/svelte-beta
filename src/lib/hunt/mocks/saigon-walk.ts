import type { TreasureHunt } from '../types';

/**
 * A walking tour through historic Saigon (District 1, HCMC).
 * ~2 km total, all stops within easy walking distance.
 * Each stop reveals a different historical map overlay.
 */
export const SAIGON_WALK: TreasureHunt = {
  id: 'hunt-saigon-historic-walk',
  title: 'Historic Saigon Walk',
  description:
    'Walk through the heart of old Saigon and see the city transform across 200 years of maps — from a river outpost in 1799 to a bustling French colonial capital.',
  stops: [
    {
      id: 'stop-notre-dame',
      order: 0,
      title: 'Notre-Dame Cathedral',
      description:
        'Built 1863-1880 with bricks shipped from Marseille. This was the spiritual centre of French Saigon. The 1878 city plan shows the cathedral square freshly laid out.',
      hint: 'Head to the red brick cathedral with twin bell towers near the central roundabout.',
      quest: 'Count the number of stained glass windows on the front facade.',
      coordinates: [106.69916, 10.77972],
      triggerRadius: 15,
      interaction: 'proximity',
      overlayMapId: 'b8a452dfbc8eeee2' // Plan de la Ville de Saigon (1878)
    },
    {
      id: 'stop-post-office',
      order: 1,
      title: 'Central Post Office',
      description:
        'Designed by Alfred Foulhoux and completed in 1891 in French colonial style. The 1898 plan shows the post office prominently on Rue Catinat — the main colonial boulevard.',
      hint: 'Cross the square from the cathedral to the grand yellow building with arched windows.',
      coordinates: [106.69972, 10.77972],
      triggerRadius: 15,
      interaction: 'proximity',
      overlayMapId: 'ed90c4244dbb9361' // Saigon Plan (1898)
    },
    {
      id: 'stop-dong-khoi',
      order: 2,
      title: 'Dong Khoi Street (Rue Catinat)',
      description:
        'Once Rue Catinat — the Champs-Élysées of the East — this boulevard was the heart of colonial nightlife. The 1923 map shows elegant shop-houses lining both sides.',
      hint: 'Walk south down the tree-lined street toward the river. Stop at the intersection with Le Loi.',
      quest: 'Find a French-era building that still has its original balcony ironwork.',
      coordinates: [106.70222, 10.77556],
      triggerRadius: 15,
      interaction: 'proximity',
      overlayMapId: '061a18dda9835b42' // Saigon - Cholon (1923)
    },
    {
      id: 'stop-opera-house',
      order: 3,
      title: 'Saigon Opera House',
      description:
        'Built in 1897 as the Opéra de Saïgon in French Beaux-Arts style. It served as the South Vietnamese National Assembly from 1955-1975. The 1882 plan shows this area before the opera was built.',
      hint: 'Look for the ornate white facade with columns on Lam Son Square.',
      coordinates: [106.70306, 10.77639],
      triggerRadius: 15,
      interaction: 'proximity',
      overlayMapId: '654dd627a3241cfe' // Saigon Plan (1882)
    },
    {
      id: 'stop-reunification',
      order: 4,
      title: 'Reunification Palace',
      description:
        'Originally the Norodom Palace (1868), rebuilt in 1966 as Independence Palace. A North Vietnamese tank crashed through these gates on April 30, 1975, ending the war. The 1942 plan shows the palace grounds in their wartime layout.',
      hint: 'Walk west through the park toward the modernist building with the wide lawn.',
      quest: 'Find the tank on the palace grounds — it is the actual T-54 that broke through.',
      coordinates: [106.69528, 10.77694],
      triggerRadius: 20,
      interaction: 'proximity',
      overlayMapId: '8b2e8a938709bed2' // Plan de Saigon - Cho Lon (1942)
    },
    {
      id: 'stop-ben-thanh',
      order: 5,
      title: 'Ben Thanh Market',
      description:
        'Saigon\'s most iconic market, built in 1912 on the site of the old citadel moat. The 1912 map shows the entire Saigon-Cholon area, including the new market and the tramway that connected the two cities.',
      hint: 'Head south to the large market hall with the clock tower entrance.',
      quest: 'Buy a Vietnamese coffee and enjoy it while looking at how the market area appeared over 100 years ago.',
      coordinates: [106.69806, 10.77222],
      triggerRadius: 20,
      interaction: 'proximity',
      overlayMapId: '0e41cf9e297d7004' // Saigon - Cholon et Environs (1912)
    }
  ],
  region: {
    center: [106.69917, 10.77600],
    zoom: 15
  },
  createdAt: 1738800000000, // Feb 6, 2025
  updatedAt: 1738800000000
};
