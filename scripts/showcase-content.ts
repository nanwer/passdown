/**
 * A showcase library for flat-pack furniture, public and internal.
 *
 * No company: the workspaces keep the names the installation already gave them,
 * and a catalog item carries a part number rather than a brand. What is real is
 * the work — cam locks and dowels on the customer side, edge banding and 2K
 * lacquer on the production side.
 *
 * Nothing here is a real instruction. It is shaped like one so that every part
 * of the product has something honest to render: a nested tree of things, a
 * catalog split between what a guide keeps and what it uses up, guide types
 * composing their own titles, per-step requirements and dependencies,
 * preconditions, panels, tables, families, and both audiences.
 */

export type ShowcaseCategory = {
  name: string;
  description: string;
  children?: ShowcaseCategory[];
};

export type ShowcaseItem = {
  name: string;
  specification: string;
  description: string;
  manufacturer: string;
  model: string;
  partNumber: string;
  defaultUnit: 'each' | 'pair' | 'g' | 'kg' | 'ml' | 'l' | 'mm' | 'cm' | 'm';
};

/** What a guide needs, and whether it still has it afterwards. */
export type ShowcaseNeed = {
  item: string;
  role: 'keep' | 'use';
  quantity: number | null;
  unit: ShowcaseItem['defaultUnit'];
  optional?: boolean;
  notes?: string;
};

export type ShowcaseStep = {
  title: string;
  text: string;
  /** A second paragraph, where one sentence is not the whole of it. */
  more?: string;
  bullets?: string[];
  panel?: { tone: 'info' | 'warning' | 'danger' | 'success' | 'decision'; text: string };
  table?: { headers: string[]; rows: string[][] };
  /** Items from this guide's own list, consumed or reused at this step. */
  uses?: { item: string; quantity?: number | null; mode?: 'consume' | 'reuse' }[];
  /** Conditions to meet before starting this step. */
  before?: { text: string; tone: 'info' | 'warning' }[];
  /** Titles of earlier steps this one depends on. */
  after?: string[];
};

/**
 * A photograph from Wikimedia Commons, used for a guide's cover and for the
 * step it illustrates.
 *
 * Every one here is CC0 or a work of the United States government, so nothing
 * in this repository depends on an attribution or share-alike term being
 * honoured downstream. They are credited anyway, in the caption, because that
 * is what the caption field is for and because it costs nothing.
 */
export type ShowcasePhoto = {
  url: string;
  credit: string;
  alt: string;
  /** The step this picture belongs on. The first step when omitted. */
  step?: string;
};

export const photos = {
  carcass: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Kitchen_renovation_9a_assembling_kitchen_cabinet_base_unit_with_countertop_not_on_yet.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A flat-pack cabinet carcass part-assembled on a floor, with the top panel not yet fitted.',
  },
  crookedDrawer: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Kitchen_renovation_9a_base_kitchen_cabinet_assembled_with_crooked_drawer.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A drawer sitting visibly crooked in its cabinet, the gap wider at one side than the other.',
  },
  drawerFront: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Kitchen_renovation_9a_examining_base_cabinet_drawer_poorly_off_center.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A close look at a drawer front sitting off centre against the cabinet opening.',
  },
  levelling: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Kitchen_renovation_9a_installing_cabinet_to_hold_microwave_using_level_and_boards.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A wall cabinet held in place with a spirit level across it and boards propping it from below.',
  },
  measuring: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Kitchen_renovation_9a_measuring_prior_to_cutting_laminate_countertop_board.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A tape measure laid along a laminate worktop with a pencil mark at the cut line.',
  },
  laminate: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Kitchen_renovation_9a_laminate_on_top_of_kitchen_cabinet_base_unit_not_yet_attached.JPG',
    credit: 'Photograph by Tomwsulcer, CC0, via Wikimedia Commons.',
    alt: 'A laminate worktop resting on a base cabinet before being fixed down.',
  },
  worktopFitting: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Kitchen_Countertop_Installation_%26_Custom_Stone_Fitting.jpg',
    credit: 'Photograph by Donovan Nimmo, CC0, via Wikimedia Commons.',
    alt: 'A worktop being fitted onto a run of kitchen cabinets.',
  },
  sprayBooth: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/US_Navy_040413-N-5328N-029_A_U.S._Air_Force_Airman_spray_paints_a_piece_of_equipment_in_a_paint_booth_at_Naval_Air_Technical_Training_Command_%28NATTC%29.jpg',
    credit:
      'Photograph by Gary Nichols, U.S. Navy — a work of the United States government, in the public domain.',
    alt: 'Someone in protective equipment spraying a workpiece inside an extracted paint booth.',
  },
} satisfies Record<string, ShowcasePhoto>;

export type ShowcaseGuide = {
  /** The guide type key, which composes the title from the subject and thing. */
  type: string;
  subject: string;
  /** The category this guide is about, by leaf name. */
  thing: string;
  summary: string;
  difficulty: 'easy' | 'moderate' | 'advanced';
  minutes: number;
  needs?: ShowcaseNeed[];
  steps: ShowcaseStep[];
  /** The broader guide on the same subject, by composed title. */
  under?: string;
  /** A photograph for this guide's cover and for one of its steps. */
  photo?: ShowcasePhoto;
};

export const publicCategories: ShowcaseCategory[] = [
  {
    name: 'Seating',
    description: 'Sofas, armchairs and dining chairs.',
    children: [
      { name: 'Sofa', description: 'Two- and three-seat frames, covers and legs.' },
      { name: 'Armchair', description: 'Single seats, including swivel bases.' },
      { name: 'Dining chair', description: 'Wooden and upholstered chairs for a table.' },
    ],
  },
  {
    name: 'Storage',
    description: 'Anything with a door, a drawer or a shelf.',
    children: [
      { name: 'Wardrobe', description: 'Full-height units, hinged and sliding.' },
      { name: 'Bookcase', description: 'Open shelving, free-standing and wall-fixed.' },
      { name: 'Drawer chest', description: 'Drawer units and their runners.' },
    ],
  },
  {
    name: 'Tables',
    description: 'Surfaces you sit at, work at or put a cup on.',
    children: [
      { name: 'Dining table', description: 'Four- and six-seat tables, fixed and extending.' },
      { name: 'Desk', description: 'Work surfaces, including cable management.' },
      { name: 'Coffee table', description: 'Low tables, veneered and solid.' },
    ],
  },
  {
    name: 'Beds',
    description: 'Frames, bases and what sits on them.',
    children: [
      { name: 'Bed frame', description: 'Headboards, side rails and legs.' },
      { name: 'Slatted base', description: 'Slats, holders and centre rails.' },
    ],
  },
  {
    name: 'Kitchen',
    description: 'Cabinets, fronts and worktops.',
    children: [
      { name: 'Kitchen cabinet', description: 'Carcasses, hinges and suspension rails.' },
      { name: 'Worktop', description: 'Laminate and solid wood surfaces.' },
    ],
  },
  {
    name: 'Lighting',
    description: 'Lamps, shades, cords and drivers.',
    children: [
      { name: 'Table lamp', description: 'Bedside and desk lamps with a cord switch.' },
      { name: 'Floor lamp', description: 'Standing lamps, including the weighted base.' },
    ],
  },
  { name: 'Textiles and rugs', description: 'Covers, cushions and floor coverings.' },
  { name: 'Outdoor furniture', description: 'Furniture that lives with the weather.' },
];

export const productionCategories: ShowcaseCategory[] = [
  {
    name: 'Panel production',
    description: 'Board in at one end, drilled and edged components out at the other.',
    children: [
      { name: 'Beam saw', description: 'Cuts full boards down to component size.' },
      { name: 'CNC borer', description: 'Dowel, cam and hinge boring.' },
      { name: 'Edge bander', description: 'Applies and trims ABS edge to cut panels.' },
    ],
  },
  {
    name: 'Surface finishing',
    description: 'Sanding and lacquer, and the measurements that keep them honest.',
    children: [
      { name: 'Sanding line', description: 'Wide-belt sanding before and between coats.' },
      { name: 'Lacquer booth', description: 'Two-pack lacquer application and curing.' },
    ],
  },
  { name: 'Fittings and hardware', description: 'Cam housings, dowels and fitting bags.' },
  {
    name: 'Flat-pack packing',
    description: 'Cartons, protection and what the label has to say.',
    children: [
      { name: 'Carton line', description: 'Forming, filling and sealing cartons.' },
      { name: 'Label printer', description: 'Article labels, weights and barcodes.' },
    ],
  },
  { name: 'Quality control', description: 'Sampling, gauges and what to do with a failure.' },
  {
    name: 'Facilities and maintenance',
    description: 'The services the lines depend on.',
    children: [
      { name: 'Dust extraction', description: 'Filters, ducting and pressure differential.' },
      { name: 'Compressed air', description: 'Compressors, dryers and line pressure.' },
    ],
  },
];

/** Things a customer keeps: they still own them when the job is done. */
export const publicTools: ShowcaseItem[] = [
  {
    name: 'Hex key 4 mm',
    specification: 'Short arm, 4 mm across flats',
    description: 'Supplied in most fitting bags. Fits cam bolts and leg plates.',
    manufacturer: '',
    model: 'HEX-4',
    partNumber: '100-004',
    defaultUnit: 'each',
  },
  {
    name: 'Hex key 5 mm',
    specification: 'Short arm, 5 mm across flats',
    description: 'For bed frame and sofa frame bolts.',
    manufacturer: '',
    model: 'HEX-5',
    partNumber: '100-005',
    defaultUnit: 'each',
  },
  {
    name: 'Cross-head screwdriver PZ2',
    specification: 'Pozidriv no. 2, 100 mm blade',
    description: 'The size every chipboard screw in this range takes.',
    manufacturer: '',
    model: 'SD-PZ2',
    partNumber: '110-002',
    defaultUnit: 'each',
  },
  {
    name: 'Rubber mallet',
    specification: 'White non-marking head, 450 g',
    description: 'Seats dowels without bruising a melamine face.',
    manufacturer: '',
    model: 'MAL-450',
    partNumber: '120-450',
    defaultUnit: 'each',
  },
  {
    name: 'Tape measure',
    specification: '5 m, millimetre graduations',
    description: 'For setting heights and checking diagonals.',
    manufacturer: '',
    model: 'TM-5',
    partNumber: '130-005',
    defaultUnit: 'each',
  },
  {
    name: 'Spirit level',
    specification: '600 mm, two vials',
    description: 'Long enough to bridge a drawer front.',
    manufacturer: '',
    model: 'LVL-600',
    partNumber: '131-600',
    defaultUnit: 'each',
  },
  {
    name: 'Cordless drill',
    specification: '18 V, adjustable clutch',
    description: 'Only for wall fixings. Fittings are tightened by hand.',
    manufacturer: '',
    model: 'DRL-18',
    partNumber: '140-018',
    defaultUnit: 'each',
  },
  {
    name: 'Masonry drill bit 8 mm',
    specification: '8 mm, 150 mm working length',
    description: 'Matches the 8 mm wall anchor supplied with anti-tip brackets.',
    manufacturer: '',
    model: 'BIT-M8',
    partNumber: '141-008',
    defaultUnit: 'each',
  },
  {
    name: 'Utility knife',
    specification: 'Retractable, snap-off blade',
    description: 'For opening cartons without scoring the panel inside.',
    manufacturer: '',
    model: 'KN-01',
    partNumber: '150-001',
    defaultUnit: 'each',
  },
  {
    name: 'Adjustable spanner',
    specification: '150 mm, jaw to 24 mm',
    description: 'For leg bolts on outdoor frames.',
    manufacturer: '',
    model: 'SPN-150',
    partNumber: '160-150',
    defaultUnit: 'each',
  },
];

/** Things a customer uses up: they are part of the furniture afterwards. */
export const publicParts: ShowcaseItem[] = [
  {
    name: 'Cam lock 15 mm',
    specification: '15 mm housing, zinc, for 18 mm board',
    description: 'Turns a quarter turn clockwise to draw the bolt in.',
    manufacturer: '',
    model: 'CAM-15',
    partNumber: '200-015',
    defaultUnit: 'each',
  },
  {
    name: 'Cam bolt 34 mm',
    specification: 'M6 × 34 mm, dowel end',
    description: 'Screws into the adjoining panel and is captured by the cam.',
    manufacturer: '',
    model: 'CAM-B34',
    partNumber: '200-034',
    defaultUnit: 'each',
  },
  {
    name: 'Wooden dowel 8 × 35 mm',
    specification: 'Beech, fluted, 8 × 35 mm',
    description: 'Locates a joint before the cam pulls it tight.',
    manufacturer: '',
    model: 'DWL-835',
    partNumber: '210-835',
    defaultUnit: 'each',
  },
  {
    name: 'Chipboard screw 4 × 30 mm',
    specification: '4 × 30 mm, coarse thread, PZ2',
    description: 'For back panels and fixing blocks.',
    manufacturer: '',
    model: 'SCR-430',
    partNumber: '220-430',
    defaultUnit: 'each',
  },
  {
    name: 'Wall anchor 8 mm',
    specification: '8 × 50 mm nylon plug with screw',
    description: 'For solid masonry. Plasterboard needs a different fixing.',
    manufacturer: '',
    model: 'ANC-8',
    partNumber: '230-008',
    defaultUnit: 'each',
  },
  {
    name: 'Anti-tip wall bracket',
    specification: 'Steel, 2 mm, slotted for adjustment',
    description: 'Ships with every unit over 900 mm tall.',
    manufacturer: '',
    model: 'TIP-01',
    partNumber: '231-001',
    defaultUnit: 'each',
  },
  {
    name: 'Felt floor pad 25 mm',
    specification: 'Self-adhesive, 25 mm, 3 mm thick',
    description: 'Under every foot that meets a hard floor.',
    manufacturer: '',
    model: 'PAD-25',
    partNumber: '240-025',
    defaultUnit: 'each',
  },
  {
    name: 'Wood glue',
    specification: 'PVA, interior, 250 ml',
    description: 'For loose dowel joints. Not used in first assembly.',
    manufacturer: '',
    model: 'GLU-250',
    partNumber: '250-250',
    defaultUnit: 'ml',
  },
  {
    name: 'Touch-up pen, white',
    specification: 'Pigmented, 2 mm nib',
    description: 'For edge chips on white melamine.',
    manufacturer: '',
    model: 'PEN-W',
    partNumber: '260-100',
    defaultUnit: 'each',
  },
  {
    name: 'Shelf pin 5 mm',
    specification: '5 mm nickel pin with lip',
    description: 'Four to a shelf, in the 32 mm hole pattern.',
    manufacturer: '',
    model: 'PIN-5',
    partNumber: '270-005',
    defaultUnit: 'each',
  },
  {
    name: 'Drawer runner 500 mm',
    specification: 'Side-mounted ball bearing, 500 mm, 25 kg',
    description: 'Left and right are handed. They are marked L and R.',
    manufacturer: '',
    model: 'RUN-500',
    partNumber: '280-500',
    defaultUnit: 'pair',
  },
  {
    name: 'Hinge damper',
    specification: 'Clip-on, for 110° concealed hinge',
    description: 'Slows the last 30 mm of a door closing.',
    manufacturer: '',
    model: 'DMP-110',
    partNumber: '290-110',
    defaultUnit: 'each',
  },
  {
    name: 'Bed slat 68 × 8 mm',
    specification: 'Layered birch, 68 × 8 mm, sprung',
    description: 'Curve upward. A slat fitted the wrong way has no spring.',
    manufacturer: '',
    model: 'SLT-688',
    partNumber: '300-688',
    defaultUnit: 'each',
  },
  {
    name: 'Leg mounting plate',
    specification: 'Steel, M8 insert, 60 × 60 mm',
    description: 'Screws to the frame; the leg screws into it.',
    manufacturer: '',
    model: 'PLT-60',
    partNumber: '310-060',
    defaultUnit: 'each',
  },
  {
    name: 'Screw cap cover, white',
    specification: 'Snap-in, 13 mm',
    description: 'Hides a cam housing on a visible face.',
    manufacturer: '',
    model: 'CAP-13',
    partNumber: '320-013',
    defaultUnit: 'each',
  },
  {
    name: 'Worktop oil',
    specification: 'Food-safe hardwax oil, 500 ml',
    description: 'Two thin coats beat one thick one.',
    manufacturer: '',
    model: 'OIL-500',
    partNumber: '330-500',
    defaultUnit: 'ml',
  },
  {
    name: 'Lamp cord set',
    specification: '2 m braided cord, inline switch, E27 holder',
    description: 'Sold complete. The switch is not replaceable on its own.',
    manufacturer: '',
    model: 'CRD-2',
    partNumber: '340-002',
    defaultUnit: 'each',
  },
];

export const productionTools: ShowcaseItem[] = [
  {
    name: 'Torque screwdriver 0.5–5 Nm',
    specification: 'Adjustable, calibrated, 1/4 in hex',
    description: 'Used wherever a fitting has a stated torque.',
    manufacturer: '',
    model: 'TD-5',
    partNumber: '405-005',
    defaultUnit: 'each',
  },
  {
    name: 'Digital calliper 150 mm',
    specification: '0–150 mm, 0.01 mm resolution',
    description: 'On the panel line for thickness and hole spacing.',
    manufacturer: '',
    model: 'CAL-150',
    partNumber: '410-150',
    defaultUnit: 'each',
  },
  {
    name: 'Moisture meter',
    specification: 'Pin type, 6–30 % wood moisture',
    description: 'Board above 12 % is not lacquered.',
    manufacturer: '',
    model: 'MM-30',
    partNumber: '420-030',
    defaultUnit: 'each',
  },
  {
    name: 'Gloss meter 60°',
    specification: '60° geometry, 0–100 GU',
    description: 'The booth standard is measured at 60°, not 20°.',
    manufacturer: '',
    model: 'GM-60',
    partNumber: '430-060',
    defaultUnit: 'each',
  },
  {
    name: 'Feeler gauge set',
    specification: '0.05–1.00 mm, 13 blades',
    description: 'For edge trimmer and pressure roller clearances.',
    manufacturer: '',
    model: 'FG-13',
    partNumber: '440-013',
    defaultUnit: 'each',
  },
  {
    name: 'Infrared thermometer',
    specification: '−30 to 300 °C, 12:1 optics',
    description: 'For glue pot and panel surface temperature.',
    manufacturer: '',
    model: 'IR-300',
    partNumber: '450-300',
    defaultUnit: 'each',
  },
  {
    name: 'Lockout padlock set',
    specification: 'Six keyed-different padlocks with hasp and tags',
    description: 'One padlock per person working inside the guard.',
    manufacturer: '',
    model: 'LO-6',
    partNumber: '500-006',
    defaultUnit: 'each',
  },
  {
    name: 'Panel saw blade 350 mm',
    specification: '350 × 4.4 × 30 mm, 72 tooth, carbide',
    description: 'Main blade. The scoring blade is a separate item.',
    manufacturer: '',
    model: 'PSB-350',
    partNumber: '600-350',
    defaultUnit: 'each',
  },
  {
    name: 'CNC router bit 8 mm',
    specification: '8 mm compression spiral, 42 mm cut length',
    description: 'Cuts clean on both faces of a melamine panel.',
    manufacturer: '',
    model: 'RB-8C',
    partNumber: '610-008',
    defaultUnit: 'each',
  },
  {
    name: 'Dial indicator with magnetic base',
    specification: '0–10 mm, 0.01 mm',
    description: 'For spindle runout and table flatness.',
    manufacturer: '',
    model: 'DI-10',
    partNumber: '460-010',
    defaultUnit: 'each',
  },
];

export const productionMaterials: ShowcaseItem[] = [
  {
    name: 'Melamine faced chipboard 18 mm',
    specification: '2800 × 2070 × 18 mm, white',
    description: 'The standard carcass board for these guides.',
    manufacturer: '',
    model: 'MFC-18-W',
    partNumber: '700-018',
    defaultUnit: 'each',
  },
  {
    name: 'ABS edge banding 22 × 1 mm',
    specification: '22 mm wide, 1 mm thick, white, 200 m reel',
    description: 'Matched to the board decor. Check the batch letter.',
    manufacturer: '',
    model: 'EB-22',
    partNumber: '710-022',
    defaultUnit: 'm',
  },
  {
    name: 'PUR hotmelt adhesive',
    specification: 'Reactive polyurethane, 2 kg cartridge',
    description: 'Moisture curing. An opened cartridge has a four-hour life.',
    manufacturer: '',
    model: 'PUR-2',
    partNumber: '800-002',
    defaultUnit: 'kg',
  },
  {
    name: '2K polyurethane lacquer',
    specification: 'Matt, 5 l, mixed 10:1 with hardener',
    description: 'Pot life 90 minutes at 20 °C.',
    manufacturer: '',
    model: 'LQ-2K-M',
    partNumber: '810-005',
    defaultUnit: 'l',
  },
  {
    name: 'Lacquer hardener',
    specification: '1 l, for 2K polyurethane',
    description: 'Ten parts lacquer to one part hardener, by volume.',
    manufacturer: '',
    model: 'LQ-H',
    partNumber: '811-001',
    defaultUnit: 'l',
  },
  {
    name: 'Sanding belt P180',
    specification: '1350 × 2620 mm, aluminium oxide',
    description: 'Base coat preparation.',
    manufacturer: '',
    model: 'SB-180',
    partNumber: '620-180',
    defaultUnit: 'each',
  },
  {
    name: 'Sanding belt P240',
    specification: '1350 × 2620 mm, aluminium oxide',
    description: 'Between coats. Never on bare board.',
    manufacturer: '',
    model: 'SB-240',
    partNumber: '620-240',
    defaultUnit: 'each',
  },
  {
    name: 'Cleaning solvent',
    specification: 'Acetone-free gun wash, 5 l',
    description: 'For spray equipment only. Not for finished panels.',
    manufacturer: '',
    model: 'CS-5',
    partNumber: '820-005',
    defaultUnit: 'l',
  },
  {
    name: 'Carton board, 3-ply',
    specification: 'BC flute, 1200 × 800 mm blank',
    description: 'Cut and formed on the carton line.',
    manufacturer: '',
    model: 'CB-3',
    partNumber: '720-003',
    defaultUnit: 'each',
  },
  {
    name: 'Polythene corner protector',
    specification: '60 × 60 × 300 mm',
    description: 'Four to a carton, one per vertical edge.',
    manufacturer: '',
    model: 'CP-60',
    partNumber: '730-060',
    defaultUnit: 'each',
  },
  {
    name: 'Barcode label roll',
    specification: '100 × 70 mm thermal, 1000 per roll',
    description: 'One label per carton, one per pallet.',
    manufacturer: '',
    model: 'LBL-100',
    partNumber: '740-100',
    defaultUnit: 'each',
  },
  {
    name: 'Pallet stretch wrap',
    specification: '500 mm × 300 m, 23 micron',
    description: 'Five wraps at the base, three at the top.',
    manufacturer: '',
    model: 'WRP-500',
    partNumber: '750-500',
    defaultUnit: 'm',
  },
  {
    name: 'Beech dowel 8 × 35 mm',
    specification: 'Fluted, 8 × 35 mm, bulk',
    description: 'Production stock for the fitting bag line.',
    manufacturer: '',
    model: 'DWL-835-B',
    partNumber: '210-835B',
    defaultUnit: 'each',
  },
  {
    name: 'Cam housing 15 mm',
    specification: '15 mm, zinc, bulk',
    description: 'Production stock. Counted by weight, packed by number.',
    manufacturer: '',
    model: 'CAM-15-B',
    partNumber: '200-015B',
    defaultUnit: 'each',
  },
  {
    name: 'Extraction filter cartridge',
    specification: 'Pleated polyester, 325 × 1000 mm',
    description: 'Sixteen to the main extraction unit.',
    manufacturer: '',
    model: 'FLT-325',
    partNumber: '630-325',
    defaultUnit: 'each',
  },
];

export const publicGuides: ShowcaseGuide[] = [
  {
    type: 'how-to',
    subject: 'assemble a wardrobe',
    thing: 'Wardrobe',
    photo: { ...photos.carcass, step: 'Build the carcass flat' },
    summary:
      'The order a flat-pack wardrobe goes together in, whatever its width or number of doors.',
    difficulty: 'moderate',
    minutes: 90,
    needs: [
      { item: 'Hex key 4 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Rubber mallet', role: 'keep', quantity: 1, unit: 'each' },
      {
        item: 'Wooden dowel 8 × 35 mm',
        role: 'use',
        quantity: 16,
        unit: 'each',
        notes: 'Count them before you start. A missing dowel is easier to find now.',
      },
      { item: 'Cam lock 15 mm', role: 'use', quantity: 12, unit: 'each' },
      { item: 'Cam bolt 34 mm', role: 'use', quantity: 12, unit: 'each' },
      { item: 'Chipboard screw 4 × 30 mm', role: 'use', quantity: 24, unit: 'each' },
      { item: 'Anti-tip wall bracket', role: 'use', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Clear a space larger than the wardrobe',
        text: 'Lay the carton down and open it on the floor where the wardrobe will stand. A full-height gable is longer than most rooms are wide once it is upright.',
        more: 'Keep the carton under the panels while you work. It is the cheapest way to stop a melamine face picking up grit from the floor.',
        before: [
          { text: 'Two people. A gable is not heavy, but it is long and it flexes.', tone: 'info' },
        ],
      },
      {
        title: 'Sort the fittings against the list',
        text: 'Tip the fitting bag out and group it by type. Every part in the list below is in the bag; if one is short, stop here rather than at the point you need it.',
        table: {
          headers: ['Fitting', 'Count', 'Where it goes'],
          rows: [
            ['Dowel 8 × 35', '16', 'Top, bottom and fixed shelf'],
            ['Cam bolt 34', '12', 'Into the gables'],
            ['Cam lock 15', '12', 'Into the horizontal panels'],
            ['Screw 4 × 30', '24', 'Back panel'],
          ],
        },
        uses: [
          { item: 'Wooden dowel 8 × 35 mm', quantity: 16 },
          { item: 'Cam lock 15 mm', quantity: 12 },
          { item: 'Cam bolt 34 mm', quantity: 12 },
        ],
      },
      {
        title: 'Build the carcass flat',
        text: 'Press the dowels into one gable, offer up the top and bottom panels, then turn each cam a quarter turn clockwise. The arrow on the cam points at the bolt when it is open.',
        more: 'Tighten every cam lightly first and go round a second time. A carcass pulled tight one corner at a time will not sit square.',
        panel: {
          tone: 'warning',
          text: 'Do not overtighten a cam. It is a quarter turn, not a full one — past that the bolt strips the board rather than the cam.',
        },
        after: ['Sort the fittings against the list'],
        uses: [
          { item: 'Rubber mallet', mode: 'reuse' },
          { item: 'Hex key 4 mm', mode: 'reuse' },
        ],
      },
      {
        title: 'Fit the back before standing it up',
        text: 'The back panel is what holds the carcass square. Check both diagonals match before you fix it, then screw it on at roughly 200 mm intervals.',
        uses: [{ item: 'Chipboard screw 4 × 30 mm', quantity: 24 }],
        after: ['Build the carcass flat'],
        panel: {
          tone: 'info',
          text: 'Measure corner to corner both ways. If the two numbers match, it is square.',
        },
      },
      {
        title: 'Stand it up and anchor it',
        text: 'Lift from the bottom, not the top, and walk it upright. Fix the anti-tip bracket to the wall before anything goes inside.',
        uses: [{ item: 'Anti-tip wall bracket', quantity: 1 }],
        after: ['Fit the back before standing it up'],
        before: [
          {
            text: 'A wardrobe is not stable until it is anchored. Do not load it first.',
            tone: 'warning',
          },
        ],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'assemble a two-door wardrobe',
    thing: 'Wardrobe',
    under: 'How to assemble a wardrobe',
    summary: 'The two-door frame, where both doors share a centre gap of 3 mm.',
    difficulty: 'moderate',
    minutes: 45,
    needs: [
      { item: 'Hex key 4 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Hinge damper', role: 'use', quantity: 4, unit: 'each', optional: true },
    ],
    steps: [
      {
        title: 'Clip the hinges onto the mounting plates',
        text: 'Hold the door at a slight angle, engage the back of the hinge on the plate, then press the front until it clicks.',
        uses: [{ item: 'Cross-head screwdriver PZ2', mode: 'reuse' }],
      },
      {
        title: 'Set the centre gap',
        text: 'The side screw moves the door left and right. Work to a 3 mm gap between the two doors, measured at the top and again at the bottom.',
        table: {
          headers: ['Screw', 'Turn', 'Effect'],
          rows: [
            ['Side', 'Clockwise', 'Door moves towards the hinge side'],
            ['Depth', 'Clockwise', 'Door sits closer to the carcass'],
            ['Height', 'Clockwise', 'Door rises'],
          ],
        },
      },
      {
        title: 'Add the dampers',
        text: 'Clip a damper to the top and bottom hinge of each door. Skip this if the doors already close softly; a damper on every hinge makes a door feel reluctant.',
        uses: [{ item: 'Hinge damper', quantity: 4 }],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'assemble a three-door wardrobe with a mirror',
    thing: 'Wardrobe',
    under: 'How to assemble a wardrobe',
    summary:
      'The three-door frame, where the centre door carries a mirror and weighs twice as much.',
    difficulty: 'advanced',
    minutes: 60,
    needs: [
      { item: 'Hex key 4 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Hinge damper', role: 'use', quantity: 6, unit: 'each' },
    ],
    steps: [
      {
        title: 'Hang the two plain doors first',
        text: 'They are lighter and they set the reference for the centre gap. Get both sitting true before the mirror door goes anywhere near the frame.',
      },
      {
        title: 'Hang the mirror door with a second pair of hands',
        text: 'The mirror door has three hinges rather than two. Engage the middle hinge first so the door cannot swing while you clip the other two.',
        panel: {
          tone: 'danger',
          text: 'A mirror door dropped face down will break, and the fragments travel. Two people, and nothing on the floor underneath.',
        },
        before: [{ text: 'Two people, and a clear floor under the door.', tone: 'warning' }],
      },
      {
        title: 'Damper every hinge on the mirror door',
        text: 'The extra weight means it closes harder. All three hinges get a damper, and the plain doors take one each at the top.',
        uses: [{ item: 'Hinge damper', quantity: 6 }],
        after: ['Hang the mirror door with a second pair of hands'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'anchor tall furniture to a wall',
    thing: 'Wardrobe',
    summary: 'Fixing a bracket into masonry, plasterboard or a stud, and knowing which you have.',
    difficulty: 'moderate',
    minutes: 25,
    needs: [
      { item: 'Cordless drill', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Masonry drill bit 8 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Spirit level', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Anti-tip wall bracket', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Wall anchor 8 mm', role: 'use', quantity: 2, unit: 'each' },
    ],
    steps: [
      {
        title: 'Find out what the wall is made of',
        text: 'Tap it. A solid sound with no give is masonry; a hollow sound is plasterboard. Press a pin in — if it goes in easily by hand, the fixing supplied is not the right one.',
        panel: {
          tone: 'decision',
          text: 'Masonry: use the 8 mm anchor supplied. Plasterboard with a stud behind: screw straight into the stud, no anchor. Plasterboard with nothing behind: you need a hollow-wall anchor, which is not in the box.',
        },
      },
      {
        title: 'Mark and drill',
        text: 'Hold the bracket against the wall at the height of the wardrobe top rail, level it, and mark through both slots.',
        uses: [
          { item: 'Cordless drill', mode: 'reuse' },
          { item: 'Masonry drill bit 8 mm', mode: 'reuse' },
          { item: 'Spirit level', mode: 'reuse' },
        ],
      },
      {
        title: 'Fix the bracket and tie the furniture to it',
        text: 'Drive the anchors home, then screw the bracket to the wardrobe. The slots allow about 15 mm of adjustment, which is enough for an uneven wall.',
        uses: [
          { item: 'Wall anchor 8 mm', quantity: 2 },
          { item: 'Anti-tip wall bracket', quantity: 1 },
        ],
        after: ['Mark and drill'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'assemble a three-seat sofa frame',
    thing: 'Sofa',
    summary: 'Frame, legs and seat platform for the three-seat model, before any cover goes on.',
    difficulty: 'moderate',
    minutes: 50,
    needs: [
      { item: 'Hex key 5 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Leg mounting plate', role: 'use', quantity: 6, unit: 'each' },
      { item: 'Felt floor pad 25 mm', role: 'use', quantity: 6, unit: 'each' },
    ],
    steps: [
      {
        title: 'Join the arms to the back',
        text: 'The back panel drops into a slot in each arm and is held by two bolts a side. Leave them finger tight until the seat platform is in.',
      },
      {
        title: 'Drop in the seat platform',
        text: 'It only fits one way round: the webbing faces up and the cross rail sits towards the back. Then tighten every bolt, working from the middle outwards.',
        after: ['Join the arms to the back'],
        uses: [{ item: 'Hex key 5 mm', mode: 'reuse' }],
      },
      {
        title: 'Fit the legs and pads',
        text: 'Six legs, not four — the middle pair carries the seat platform. Stick a felt pad to each before you stand the sofa up.',
        uses: [
          { item: 'Leg mounting plate', quantity: 6 },
          { item: 'Felt floor pad 25 mm', quantity: 6 },
        ],
        after: ['Drop in the seat platform'],
      },
    ],
  },
  {
    type: 'replacement',
    subject: 'leg',
    thing: 'Sofa',
    summary:
      'Swapping a leg that has stripped its thread or split, without lifting the whole sofa.',
    difficulty: 'easy',
    minutes: 15,
    needs: [
      { item: 'Hex key 5 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Leg mounting plate', role: 'use', quantity: 1, unit: 'each', optional: true },
      { item: 'Felt floor pad 25 mm', role: 'use', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Tip the sofa back, do not lift it',
        text: 'Two people tilt it onto its back against a wall. One leg can be reached this way without taking the weight off the others.',
        before: [{ text: 'Clear the floor behind the sofa first.', tone: 'info' }],
      },
      {
        title: 'Check whether the plate or the leg failed',
        text: 'Unscrew the leg. If the thread in the plate is stripped rather than the leg, the plate is what needs replacing.',
        panel: {
          tone: 'decision',
          text: 'Leg turns freely and never tightens: the plate is stripped. Leg tightens but wobbles: the leg is split. Replace whichever it is, not both.',
        },
        after: ['Tip the sofa back, do not lift it'],
      },
      {
        title: 'Fit the new part and a fresh pad',
        text: 'A replaced leg always gets a new felt pad — the old one will have compressed to a different thickness and the sofa will rock.',
        uses: [
          { item: 'Leg mounting plate', quantity: 1 },
          { item: 'Felt floor pad 25 mm', quantity: 1 },
        ],
      },
    ],
  },
  {
    type: 'repair',
    subject: 'loose joint',
    thing: 'Dining chair',
    summary: 'A chair that rocks because a dowelled joint has worked loose, glued and cramped.',
    difficulty: 'moderate',
    minutes: 40,
    needs: [
      { item: 'Rubber mallet', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Wood glue', role: 'use', quantity: 20, unit: 'ml' },
      { item: 'Wooden dowel 8 × 35 mm', role: 'use', quantity: 2, unit: 'each', optional: true },
    ],
    steps: [
      {
        title: 'Find which joint is moving',
        text: 'Put the chair on a flat floor and press each corner in turn. The joint that moves is rarely the one that creaks.',
      },
      {
        title: 'Open the joint fully',
        text: 'Tap it apart with the mallet rather than pulling. A joint opened halfway and glued is weaker than one left alone.',
        panel: {
          tone: 'warning',
          text: 'Old glue has to come off. New glue on old glue is a joint that will fail again within a month.',
        },
        after: ['Find which joint is moving'],
      },
      {
        title: 'Glue, close and leave it alone',
        text: 'Glue both the dowel and the hole, close the joint, and cramp it. Twenty minutes to hold, twenty-four hours before anyone sits on it.',
        uses: [
          { item: 'Wood glue', quantity: 20 },
          { item: 'Wooden dowel 8 × 35 mm', quantity: 2 },
        ],
        after: ['Open the joint fully'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'assemble a six-drawer chest',
    thing: 'Drawer chest',
    photo: { ...photos.drawerFront, step: 'Hang the drawers and set the fronts' },
    summary: 'Carcass, runners and six drawer boxes, in the order that keeps the fronts aligned.',
    difficulty: 'moderate',
    minutes: 75,
    needs: [
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Hex key 4 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Drawer runner 500 mm', role: 'use', quantity: 6, unit: 'pair' },
      { item: 'Cam lock 15 mm', role: 'use', quantity: 8, unit: 'each' },
      { item: 'Anti-tip wall bracket', role: 'use', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Build the carcass and check it is square',
        text: 'Same order as any carcass: dowels, panels, cams, back. The diagonals have to match or no drawer will run smoothly.',
        uses: [{ item: 'Cam lock 15 mm', quantity: 8 }],
      },
      {
        title: 'Fit the runners from the bottom up',
        text: 'Runners are handed. L and R are stamped on the inside face. Each pair screws into the row of holes at the same height on both gables.',
        uses: [{ item: 'Drawer runner 500 mm', quantity: 6 }],
        after: ['Build the carcass and check it is square'],
        panel: {
          tone: 'info',
          text: 'Count the holes rather than measuring. The 32 mm pattern makes miscounting obvious and mismeasuring invisible.',
        },
      },
      {
        title: 'Hang the drawers and set the fronts',
        text: 'Push each box in until the catch clicks. Adjust the fronts last, all six together, so the gaps read as one line rather than six separate ones.',
        after: ['Fit the runners from the bottom up'],
      },
      {
        title: 'Anchor it',
        text: 'A chest with the top two drawers open will tip. Fix the bracket before it goes into use.',
        uses: [{ item: 'Anti-tip wall bracket', quantity: 1 }],
        before: [{ text: 'Do not fill the drawers before anchoring.', tone: 'warning' }],
      },
    ],
  },
  {
    type: 'replacement',
    subject: 'runner',
    thing: 'Drawer chest',
    photo: { ...photos.crookedDrawer, step: 'Release the drawer box' },
    summary: 'A drawer that drops at the front or will not pull out is usually one bent runner.',
    difficulty: 'easy',
    minutes: 20,
    needs: [
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Drawer runner 500 mm', role: 'use', quantity: 1, unit: 'pair' },
    ],
    steps: [
      {
        title: 'Release the drawer box',
        text: 'Pull the drawer fully out, then press the plastic catch on each runner — one up, one down — and lift the box away.',
      },
      {
        title: 'Replace the pair, not the one',
        text: 'Runners wear together. Fitting one new runner against one worn one puts the drawer out of parallel and it will bind again.',
        uses: [{ item: 'Drawer runner 500 mm', quantity: 1 }],
        after: ['Release the drawer box'],
        panel: {
          tone: 'info',
          text: 'They are sold as a pair for this reason. The part number covers left and right together.',
        },
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Bookcase',
    summary: 'The yearly check that keeps a loaded bookcase square: cams, back panel and anchor.',
    difficulty: 'easy',
    minutes: 15,
    needs: [{ item: 'Hex key 4 mm', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Unload the top two shelves',
        text: 'Books are heavy and the top of a bookcase is where the leverage is. Everything else can stay where it is.',
      },
      {
        title: 'Check every cam a quarter turn',
        text: 'Go round each cam with the key. Any that moves more than a few degrees had worked loose; any that will not move at all is already tight.',
        uses: [{ item: 'Hex key 4 mm', mode: 'reuse' }],
        after: ['Unload the top two shelves'],
      },
      {
        title: 'Look at the back panel',
        text: 'A back panel that has pulled away at one corner is the first sign of racking. Re-fix it before the shelves start to sag.',
        panel: {
          tone: 'success',
          text: 'Diagonals equal, back flat, anchor tight: nothing else needs doing for another year.',
        },
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'hang a wall shelf on plasterboard',
    thing: 'Bookcase',
    photo: { ...photos.levelling, step: 'Level it over the whole bracket span' },
    summary: 'Finding a stud, and what to do when there is not one where you want the shelf.',
    difficulty: 'moderate',
    minutes: 30,
    needs: [
      { item: 'Cordless drill', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Spirit level', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Tape measure', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Find the studs',
        text: 'Studs are usually 400 or 600 mm apart. Find one, measure across, and mark the next before you commit to a shelf position.',
      },
      {
        title: 'Decide what the shelf is for',
        text: 'A shelf fixed into plasterboard alone holds very little, whatever the anchor claims.',
        panel: {
          tone: 'decision',
          text: 'Into studs: books, and anything heavy. Into plasterboard with hollow anchors: photographs, a plant, nothing that would hurt if it came down.',
        },
      },
      {
        title: 'Level it over the whole bracket span',
        text: 'Level the line between the two brackets, not each bracket separately. A 600 mm level across both is worth more than a short one twice.',
        uses: [{ item: 'Spirit level', mode: 'reuse' }],
        after: ['Find the studs'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'level a table on an uneven floor',
    thing: 'Dining table',
    summary: 'Which foot to adjust, and why the one that rocks is not the one to touch.',
    difficulty: 'easy',
    minutes: 15,
    needs: [
      { item: 'Spirit level', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Felt floor pad 25 mm', role: 'use', quantity: 4, unit: 'each' },
    ],
    steps: [
      {
        title: 'Find the diagonal that rocks',
        text: 'Press each corner. A four-legged table rocks on one diagonal, and the fault is always in one of those two feet, never the other pair.',
      },
      {
        title: 'Lengthen the short leg, never shorten the long one',
        text: 'Wind out whichever of the two rocking feet is off the floor. Shortening the others puts the top out of level even though the rocking stops.',
        after: ['Find the diagonal that rocks'],
        uses: [{ item: 'Spirit level', mode: 'reuse' }],
      },
      {
        title: 'Pad all four feet',
        text: 'Felt pads on every foot, including the ones you did not adjust, so all four sit on the same material.',
        uses: [{ item: 'Felt floor pad 25 mm', quantity: 4 }],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'fit a cable tray under a desk',
    thing: 'Desk',
    summary:
      'Getting the leads off the floor without blocking the drawer or the height adjustment.',
    difficulty: 'easy',
    minutes: 20,
    needs: [
      { item: 'Cross-head screwdriver PZ2', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Chipboard screw 4 × 30 mm', role: 'use', quantity: 4, unit: 'each' },
    ],
    steps: [
      {
        title: 'Work out what has to stay clear',
        text: 'Open the drawer fully and look underneath. The tray goes behind the drawer travel, not under it.',
      },
      {
        title: 'Screw the tray to the underside',
        text: 'Four screws, two each end, into the solid rail rather than the panel. A 30 mm screw into an 18 mm panel from below will come through the top.',
        uses: [{ item: 'Chipboard screw 4 × 30 mm', quantity: 4 }],
        panel: {
          tone: 'warning',
          text: 'Check the screw length against the panel thickness before driving it. This is the one place in the range where it matters.',
        },
        after: ['Work out what has to stay clear'],
      },
    ],
  },
  {
    type: 'repair',
    subject: 'chipped veneer edge',
    thing: 'Coffee table',
    summary: 'Making a chipped edge disappear at arm’s length, which is as far as it can be taken.',
    difficulty: 'easy',
    minutes: 25,
    needs: [
      { item: 'Touch-up pen, white', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Utility knife', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Trim the loose edge back',
        text: 'Any veneer that has lifted but not broken off will lift further. Pare it back to where it is still stuck down.',
        uses: [{ item: 'Utility knife', mode: 'reuse' }],
      },
      {
        title: 'Colour in thin passes',
        text: 'Several light passes, letting each dry, rather than one heavy one. The pen dries darker than it looks going on.',
        uses: [{ item: 'Touch-up pen, white', quantity: 1 }],
        after: ['Trim the loose edge back'],
        panel: {
          tone: 'info',
          text: 'This hides a chip. It does not repair one — the edge is still weaker there.',
        },
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'slats',
    thing: 'Bed frame',
    summary: 'The six-month check on a slatted base, and the two failures worth catching early.',
    difficulty: 'easy',
    minutes: 20,
    needs: [{ item: 'Tape measure', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Take the mattress off',
        text: 'The base cannot be judged through a mattress. Stand it against a wall rather than folding it.',
      },
      {
        title: 'Check curve, spacing and holders',
        text: 'Every slat curves upward. A flat slat has lost its spring, and a cracked holder lets a slat drop under load.',
        table: {
          headers: ['Check', 'Pass', 'Action if it fails'],
          rows: [
            ['Slat curve', 'Bows upward', 'Replace the slat'],
            ['Gap between slats', '≤ 90 mm', 'Reposition, or add a slat'],
            ['Holder condition', 'No cracks', 'Replace the holder'],
            ['Centre rail foot', 'Touching floor', 'Wind the foot down'],
          ],
        },
        after: ['Take the mattress off'],
        uses: [{ item: 'Tape measure', mode: 'reuse' }],
      },
      {
        title: 'Record what you found',
        text: 'Note the date and anything replaced. A base that needs a slat every six months has a frame problem, not a slat problem.',
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'convert a bed base for a thicker mattress',
    thing: 'Slatted base',
    summary: 'Dropping the base so the mattress top stays at the height it was.',
    difficulty: 'moderate',
    minutes: 45,
    needs: [
      { item: 'Hex key 5 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Bed slat 68 × 8 mm', role: 'use', quantity: 2, unit: 'each', optional: true },
    ],
    steps: [
      {
        title: 'Measure what you have and what is coming',
        text: 'Mattress top height is what matters, not base height. Subtract the new mattress depth from the height you want to sit at.',
      },
      {
        title: 'Move the side rails down one hole',
        text: 'The rails bolt through a row of holes at 30 mm spacing. Move both sides by the same number of holes, checking the frame stays square as you go.',
        after: ['Measure what you have and what is coming'],
        panel: {
          tone: 'warning',
          text: 'Both sides, the same number of holes, before you tighten anything. A rail one hole out will twist the frame.',
        },
      },
      {
        title: 'Reset the centre rail foot',
        text: 'Lowering the base leaves the centre foot short. Wind it back down until it just touches, no more — it supports, it does not lift.',
        uses: [{ item: 'Hex key 5 mm', mode: 'reuse' }],
        after: ['Move the side rails down one hole'],
      },
    ],
  },
  {
    type: 'replacement',
    subject: 'hinge damper',
    thing: 'Kitchen cabinet',
    photo: { ...photos.worktopFitting, step: 'Confirm it is the damper' },
    summary: 'A kitchen door that slams has a damper that has lost its oil.',
    difficulty: 'easy',
    minutes: 10,
    needs: [{ item: 'Hinge damper', role: 'use', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Confirm it is the damper',
        text: 'Press the damper plunger with a finger. A working one pushes back steadily; a failed one collapses with no resistance.',
      },
      {
        title: 'Unclip and replace',
        text: 'It clips to the hinge arm and comes off with a thumb. No tool, and nothing has to come off the cabinet.',
        uses: [{ item: 'Hinge damper', quantity: 1 }],
        after: ['Confirm it is the damper'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'cut a worktop to length',
    thing: 'Worktop',
    photo: { ...photos.measuring, step: 'Mark and score the laminate' },
    summary: 'A clean cut in laminate, and sealing the edge so the core never sees water.',
    difficulty: 'advanced',
    minutes: 60,
    needs: [
      { item: 'Utility knife', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Tape measure', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Worktop oil', role: 'use', quantity: 50, unit: 'ml', optional: true },
    ],
    steps: [
      {
        title: 'Mark and score the laminate',
        text: 'Score the line with the knife before any saw touches it. The score stops the laminate chipping where the blade enters.',
        uses: [{ item: 'Utility knife', mode: 'reuse' }],
      },
      {
        title: 'Cut from the underside where you can',
        text: 'A circular blade cuts on the up stroke and chips the face it exits. Cut face down, or use a fine blade and cut face up slowly.',
        after: ['Mark and score the laminate'],
        panel: {
          tone: 'danger',
          text: 'Eye protection, and support both sides of the cut. A worktop that drops as the cut finishes will tear the last 50 mm.',
        },
      },
      {
        title: 'Seal the cut edge',
        text: 'The core is chipboard and it swells. Seal the exposed edge before the worktop goes anywhere near a sink.',
        uses: [{ item: 'Worktop oil', quantity: 50 }],
        after: ['Cut from the underside where you can'],
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Worktop',
    photo: { ...photos.laminate, step: 'Test with water' },
    summary: 'Re-oiling a solid wood worktop: how often, and how to tell when it is due.',
    difficulty: 'easy',
    minutes: 90,
    needs: [{ item: 'Worktop oil', role: 'use', quantity: 200, unit: 'ml' }],
    steps: [
      {
        title: 'Test with water',
        text: 'Put a teaspoon of water on the surface. Beads standing proud means the oil is still working; a dark patch within a minute means it is due.',
      },
      {
        title: 'Two thin coats, not one thick one',
        text: 'Wipe on, leave ten minutes, wipe off everything that has not soaked in. Then repeat. Oil left standing stays sticky for weeks.',
        uses: [{ item: 'Worktop oil', quantity: 200 }],
        after: ['Test with water'],
        panel: {
          tone: 'warning',
          text: 'Oily cloths can heat up on their own. Lay them flat to dry outdoors before throwing them away.',
        },
      },
    ],
  },
  {
    type: 'replacement',
    subject: 'cord set',
    thing: 'Table lamp',
    summary: 'Replacing a damaged cord set as a complete unit, which is the only way it is sold.',
    difficulty: 'moderate',
    minutes: 30,
    needs: [{ item: 'Lamp cord set', role: 'use', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Unplug it and check what failed',
        text: 'Cord sets are sold complete because the switch cannot be opened. If the switch is the fault, the cord goes with it.',
        before: [{ text: 'Unplugged at the wall before anything else.', tone: 'warning' }],
        panel: {
          tone: 'danger',
          text: 'If the lamp has been tripping a breaker, stop here and have it looked at. That is not a cord fault.',
        },
      },
      {
        title: 'Thread the new set through the base',
        text: 'Feed from the top down, so the strain relief ends up on the inside where it belongs.',
        uses: [{ item: 'Lamp cord set', quantity: 1 }],
        after: ['Unplug it and check what failed'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'clean a wool rug',
    thing: 'Textiles and rugs',
    summary: 'Getting a spill out of wool without felting the pile.',
    difficulty: 'easy',
    minutes: 40,
    steps: [
      {
        title: 'Lift, do not rub',
        text: 'Press a dry cloth into the spill and lift. Rubbing works the spill into the pile and mats the fibres permanently.',
      },
      {
        title: 'Cool water only',
        text: 'Wool felts with heat and agitation together. Cool water, a light touch, and let it dry flat and away from a radiator.',
        panel: {
          tone: 'warning',
          text: 'No hot water, no machine, no tumble dryer. Felting cannot be undone.',
        },
        after: ['Lift, do not rub'],
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Outdoor furniture',
    summary: 'Putting outdoor furniture away for winter so it comes back out in one piece.',
    difficulty: 'easy',
    minutes: 60,
    needs: [
      { item: 'Adjustable spanner', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Worktop oil', role: 'use', quantity: 250, unit: 'ml', optional: true },
    ],
    steps: [
      {
        title: 'Wash and let it dry completely',
        text: 'Anything stored damp will bloom with mould by February. Dry means dry to the touch and left another day.',
      },
      {
        title: 'Check every bolt before storing, not after',
        text: 'A season outdoors loosens frame bolts. Tightening them now means next spring is a wipe down rather than a rebuild.',
        uses: [{ item: 'Adjustable spanner', mode: 'reuse' }],
        after: ['Wash and let it dry completely'],
      },
      {
        title: 'Oil bare timber if it is going outside anyway',
        text: 'Furniture staying out under a cover benefits from a coat. Furniture coming into a dry garage does not need one.',
        uses: [{ item: 'Worktop oil', quantity: 250 }],
        panel: {
          tone: 'decision',
          text: 'Stored indoors and dry: no oil needed. Left outside under a cover: oil it. Left outside uncovered: bring it in.',
        },
      },
    ],
  },
];

export const productionGuides: ShowcaseGuide[] = [
  {
    type: 'how-to',
    subject: 'set the beam saw for an 18 mm panel run',
    thing: 'Beam saw',
    summary: 'Blade projection, scoring alignment and the first-off check before a run starts.',
    difficulty: 'moderate',
    minutes: 45,
    needs: [
      { item: 'Digital calliper 150 mm', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Feeler gauge set', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Melamine faced chipboard 18 mm', role: 'use', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Confirm the machine is at rest and isolated',
        text: 'Main isolator off and locked before any hand goes near the blade. The pressure beam holds its position with the power off; it is not a support.',
        before: [
          { text: 'Lockout applied and the key in your pocket, not the lock.', tone: 'warning' },
        ],
        panel: {
          tone: 'danger',
          text: 'Never set blade projection with the isolator live, whatever the guard position says.',
        },
      },
      {
        title: 'Set blade projection to 22 mm',
        text: 'Main blade projects 4 mm above the board for an 18 mm panel. Measure to the tooth tip, not the plate.',
        uses: [{ item: 'Digital calliper 150 mm', mode: 'reuse' }],
        after: ['Confirm the machine is at rest and isolated'],
      },
      {
        title: 'Align the scoring blade',
        text: 'The scoring blade must be on the same centre line as the main blade and cut 2 mm deep. Misalignment shows as chipping on one side of the cut only.',
        uses: [{ item: 'Feeler gauge set', mode: 'reuse' }],
        table: {
          headers: ['Setting', 'Target', 'Tolerance'],
          rows: [
            ['Main blade projection', '22 mm', '± 0.5 mm'],
            ['Scoring depth', '2.0 mm', '± 0.2 mm'],
            ['Scoring offset', '0.0 mm', '± 0.05 mm'],
          ],
        },
        after: ['Set blade projection to 22 mm'],
      },
      {
        title: 'Cut a first-off and measure it',
        text: 'One full-width cut, measured at both ends and the middle. Do not release the run on a single measurement.',
        uses: [{ item: 'Melamine faced chipboard 18 mm', quantity: 1 }],
        after: ['Align the scoring blade'],
        panel: {
          tone: 'success',
          text: 'Three measurements within ± 0.3 mm and no chipping on either face: release the run.',
        },
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Beam saw',
    summary: 'Changing the main blade on schedule, and what to record when you do.',
    difficulty: 'moderate',
    minutes: 40,
    needs: [
      { item: 'Panel saw blade 350 mm', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Torque screwdriver 0.5–5 Nm', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Lock off and prove dead',
        text: 'Isolate, apply your padlock, then try to start the machine. Proving it will not start is part of the procedure, not a formality.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        before: [{ text: 'Your own padlock. Never work under someone else’s.', tone: 'warning' }],
      },
      {
        title: 'Note the cut count before removing the blade',
        text: 'The blade comes off with its hours on it. Recorded afterwards, that number is a guess.',
        after: ['Lock off and prove dead'],
      },
      {
        title: 'Fit the new blade and torque the flange',
        text: 'Rotation arrow towards the front of the machine. Flange bolts to 12 Nm, opposite pairs, two passes.',
        uses: [{ item: 'Panel saw blade 350 mm', quantity: 1 }],
        after: ['Note the cut count before removing the blade'],
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'panel dimensions',
    thing: 'Beam saw',
    summary:
      'The hourly sample: length, width, squareness and edge quality, and what fails a batch.',
    difficulty: 'easy',
    minutes: 15,
    needs: [{ item: 'Digital calliper 150 mm', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Take three panels from the stack',
        text: 'First, middle and last of the hour. Taking three from the top tells you about the last two minutes only.',
      },
      {
        title: 'Measure against the tolerance table',
        text: 'Every dimension at both ends. A panel in tolerance at one end and out at the other is a squareness fault, not a size fault.',
        table: {
          headers: ['Dimension', 'Nominal', 'Tolerance', 'Fail action'],
          rows: [
            ['Length', 'Per order', '± 0.3 mm', 'Stop the saw, re-set the fence'],
            ['Width', 'Per order', '± 0.3 mm', 'Stop the saw, re-set the fence'],
            ['Diagonal difference', '0 mm', '≤ 0.5 mm', 'Check the pressure beam'],
            ['Edge chipping', 'None visible', '—', 'Check the scoring blade'],
          ],
        },
        uses: [{ item: 'Digital calliper 150 mm', mode: 'reuse' }],
        after: ['Take three panels from the stack'],
      },
      {
        title: 'Quarantine the hour, not the panel',
        text: 'A failed sample condemns everything cut since the last passing sample. Move the whole hour to the hold area.',
        panel: {
          tone: 'warning',
          text: 'Do not sort a failed hour on the line. Sorting happens in the hold area, by someone who did not cut it.',
        },
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'load a drilling programme for a wardrobe gable',
    thing: 'CNC borer',
    summary:
      'Selecting the programme, proving the origin, and the dry run that catches a wrong part.',
    difficulty: 'moderate',
    minutes: 30,
    needs: [{ item: 'Digital calliper 150 mm', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Check the programme number against the works order',
        text: 'Gables for the two-door and three-door wardrobe differ by one hinge row. The programme numbers differ by one digit.',
        panel: {
          tone: 'warning',
          text: 'Read the number twice. This is the most common way a whole batch is scrapped here.',
        },
      },
      {
        title: 'Prove the origin on a scrap panel',
        text: 'Run the first hole only and measure to the reference edge. 32 mm from the front edge, 96 mm from the bottom.',
        uses: [{ item: 'Digital calliper 150 mm', mode: 'reuse' }],
        after: ['Check the programme number against the works order'],
      },
      {
        title: 'Dry run with the spindles raised',
        text: 'Watch the head travel the full programme once with no cut. It costs ninety seconds and catches a clamp in the path.',
        after: ['Prove the origin on a scrap panel'],
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'CNC borer',
    summary: 'The weekly spindle service: runout, lubrication and the readings that mean stop.',
    difficulty: 'advanced',
    minutes: 60,
    needs: [
      { item: 'Dial indicator with magnetic base', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Lock off and let the spindle cool',
        text: 'Runout measured on a hot spindle reads low. Thirty minutes from last run before the indicator goes on.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        before: [{ text: 'Spindle stationary for at least 30 minutes.', tone: 'info' }],
      },
      {
        title: 'Measure runout on each spindle',
        text: 'Indicator on the collet face, rotate by hand through a full turn, record the total indicated reading.',
        table: {
          headers: ['Reading', 'Action'],
          rows: [
            ['≤ 0.02 mm', 'Normal. Record and continue.'],
            ['0.02 – 0.05 mm', 'Record, flag for the next service.'],
            ['> 0.05 mm', 'Stop. The spindle goes out for rebuild.'],
          ],
        },
        uses: [{ item: 'Dial indicator with magnetic base', mode: 'reuse' }],
        after: ['Lock off and let the spindle cool'],
      },
    ],
  },
  {
    type: 'replacement',
    subject: 'router bit',
    thing: 'CNC borer',
    summary: 'Swapping a compression bit at end of life without disturbing the programme origin.',
    difficulty: 'moderate',
    minutes: 20,
    needs: [
      { item: 'CNC router bit 8 mm', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Torque screwdriver 0.5–5 Nm', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Retract to the change position first',
        text: 'Use the machine’s own change position. Moving the head by hand loses the origin and the next panel is drilled somewhere else.',
        panel: {
          tone: 'warning',
          text: 'Never push the head. If it has been pushed, re-home before running anything.',
        },
      },
      {
        title: 'Clean the collet before the new bit goes in',
        text: 'Dust in a collet reads as runout and shows as an oversized hole. Wipe it dry; no oil.',
        after: ['Retract to the change position first'],
      },
      {
        title: 'Fit and set the projection',
        text: 'Compression bits cut clean on both faces only at the right projection. 42 mm from the collet face.',
        uses: [{ item: 'CNC router bit 8 mm', quantity: 1 }],
        after: ['Clean the collet before the new bit goes in'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'run an edge banding changeover',
    thing: 'Edge bander',
    summary: 'The shape of every changeover on this machine, whatever is changing.',
    difficulty: 'moderate',
    minutes: 35,
    needs: [
      { item: 'Infrared thermometer', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Feeler gauge set', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Run the line empty before you stop it',
        text: 'Clear the last panel through. A panel left in the machine during a changeover picks up glue that has been sitting.',
      },
      {
        title: 'Change what is changing, then re-prove the settings',
        text: 'Every changeover ends the same way: glue temperature, feed speed, trimmer clearance, then a sample panel.',
        table: {
          headers: ['Setting', 'Target'],
          rows: [
            ['Glue pot temperature', '190 – 200 °C'],
            ['Feed speed', '18 m/min'],
            ['Pressure roller gap', 'Board thickness − 0.2 mm'],
            ['Trimmer clearance', '0.05 mm'],
          ],
        },
        uses: [
          { item: 'Infrared thermometer', mode: 'reuse' },
          { item: 'Feeler gauge set', mode: 'reuse' },
        ],
        after: ['Run the line empty before you stop it'],
      },
      {
        title: 'Sample panel, then release',
        text: 'One panel, all four edges, checked for adhesion and trim. It is scrap either way — run it before the order, not with it.',
        after: ['Change what is changing, then re-prove the settings'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'change the edge banding reel between colours',
    thing: 'Edge bander',
    under: 'How to run an edge banding changeover',
    summary:
      'The colour change specifically: purging the old tape and proving the new batch matches.',
    difficulty: 'moderate',
    minutes: 25,
    needs: [{ item: 'ABS edge banding 22 × 1 mm', role: 'use', quantity: 200, unit: 'm' }],
    steps: [
      {
        title: 'Check the batch letter against the board',
        text: 'Edge and board are matched by batch, not just by colour name. Two whites from different batches are visibly different under shop lighting.',
        panel: {
          tone: 'warning',
          text: 'A batch mismatch is not visible on the machine and is obvious in a customer’s kitchen.',
        },
      },
      {
        title: 'Purge the last of the old tape',
        text: 'Feed the new reel through until the old colour is out of the magazine. Two metres is usually enough; check rather than count.',
        uses: [{ item: 'ABS edge banding 22 × 1 mm', quantity: 200 }],
        after: ['Check the batch letter against the board'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'change the edge banding reel between thicknesses',
    thing: 'Edge bander',
    under: 'How to run an edge banding changeover',
    summary: 'The thickness change: trimmer and pressure roller both move, and both have to move.',
    difficulty: 'advanced',
    minutes: 40,
    needs: [{ item: 'Feeler gauge set', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Reset the pressure roller for the new thickness',
        text: 'The roller gap is board thickness minus 0.2 mm, and it does not follow the tape. Set it before the tape goes in.',
        uses: [{ item: 'Feeler gauge set', mode: 'reuse' }],
      },
      {
        title: 'Reset both trimmers',
        text: 'Top and bottom trimmers are set separately. A 2 mm tape run with 1 mm trimmer settings leaves a lip you can feel.',
        after: ['Reset the pressure roller for the new thickness'],
        panel: {
          tone: 'info',
          text: 'Run a finger along the finished edge. A lip you can feel is a lip the customer will feel.',
        },
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'set the PUR glue pot',
    thing: 'Edge bander',
    summary: 'Bringing a reactive adhesive up to temperature without cooking the cartridge.',
    difficulty: 'moderate',
    minutes: 30,
    needs: [
      { item: 'PUR hotmelt adhesive', role: 'use', quantity: 2, unit: 'kg' },
      { item: 'Infrared thermometer', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Check the cartridge has life left',
        text: 'PUR cures with moisture in the air. An opened cartridge lasts four hours in the pot, whatever the clock on the wall says.',
        panel: {
          tone: 'warning',
          text: 'A cartridge past its pot life will bond on the machine and fail in the customer’s hands. Discard it.',
        },
      },
      {
        title: 'Bring the pot to 190 °C and hold',
        text: 'Give it twenty minutes at temperature before the first panel. Glue that has reached temperature and glue that has been at temperature are not the same.',
        uses: [
          { item: 'PUR hotmelt adhesive', quantity: 2 },
          { item: 'Infrared thermometer', mode: 'reuse' },
        ],
        after: ['Check the cartridge has life left'],
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'edge adhesion',
    thing: 'Edge bander',
    summary: 'The destructive sample that proves the glue line, taken twice a shift.',
    difficulty: 'moderate',
    minutes: 20,
    steps: [
      {
        title: 'Take a sample from the middle of the run',
        text: 'The first and last panels of a run are not representative. Take one from the middle of the stack.',
      },
      {
        title: 'Peel the edge and read the failure',
        text: 'Grip the tape at a corner and pull it back on itself. What you want to see is fibre from the board coming away with the tape.',
        table: {
          headers: ['What comes away', 'Meaning', 'Action'],
          rows: [
            ['Board fibre on the tape', 'Glue line stronger than the board', 'Pass'],
            [
              'Clean tape, glue on board',
              'Glue did not wet the tape',
              'Check tape and pot temperature',
            ],
            ['Clean board, glue on tape', 'Glue did not wet the board', 'Check pressure roller'],
          ],
        },
        after: ['Take a sample from the middle of the run'],
      },
    ],
  },
  {
    type: 'repair',
    subject: 'trimmer chatter',
    thing: 'Edge bander',
    summary: 'A rippled trim line, traced from the symptom back to the three things that cause it.',
    difficulty: 'advanced',
    minutes: 50,
    needs: [
      { item: 'Feeler gauge set', role: 'keep', quantity: 1, unit: 'each' },
      { item: 'Dial indicator with magnetic base', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Confirm it is chatter and not a blunt cutter',
        text: 'Chatter is regular and repeats at the same spacing on every panel. A blunt cutter tears and is irregular.',
      },
      {
        title: 'Work through the three causes in order',
        text: 'Cheapest first: tracing shoe pressure, then cutter runout, then spindle bearing play. Skipping to the bearing is how a shift gets lost.',
        table: {
          headers: ['Cause', 'Check', 'Fix'],
          rows: [
            ['Tracing shoe', 'Spring pressure by hand', 'Re-tension'],
            ['Cutter runout', 'Dial indicator, > 0.03 mm', 'Replace the cutter'],
            ['Spindle play', 'Lever test at the nose', 'Machine out of service'],
          ],
        },
        uses: [{ item: 'Dial indicator with magnetic base', mode: 'reuse' }],
        after: ['Confirm it is chatter and not a blunt cutter'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'change the sanding belt for a base coat',
    thing: 'Sanding line',
    summary: 'Grit selection, belt tracking and the check that the surface is ready for lacquer.',
    difficulty: 'moderate',
    minutes: 25,
    needs: [
      { item: 'Sanding belt P180', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Lock off before opening the belt housing',
        text: 'The housing interlock is a guard, not an isolator. Padlock the isolator as well.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        before: [{ text: 'Isolator locked, tag signed.', tone: 'warning' }],
      },
      {
        title: 'Fit P180 for a base coat',
        text: 'P180 on bare board before the base coat. P240 is for between coats and will polish bare board rather than key it.',
        uses: [{ item: 'Sanding belt P180', quantity: 1 }],
        after: ['Lock off before opening the belt housing'],
        panel: {
          tone: 'info',
          text: 'Arrow on the belt back points the way the belt runs. A belt fitted backwards sheds grit within the hour.',
        },
      },
      {
        title: 'Track the belt at low speed',
        text: 'Run it up briefly and watch it centre. A belt still drifting after thirty seconds is a tracking fault, not a settling-in one.',
        after: ['Fit P180 for a base coat'],
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'surface roughness',
    thing: 'Sanding line',
    summary: 'Judging a sanded panel by hand and by light before it goes to the booth.',
    difficulty: 'easy',
    minutes: 10,
    needs: [{ item: 'Moisture meter', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Look across the panel, not at it',
        text: 'Hold it so the light rakes across the surface. Sanding marks are invisible from above and obvious at a low angle.',
      },
      {
        title: 'Check moisture before releasing to the booth',
        text: 'Board above 12 % moisture will blister under lacquer. Measure at three points, not one.',
        uses: [{ item: 'Moisture meter', mode: 'reuse' }],
        panel: {
          tone: 'warning',
          text: 'Above 12 %: the panel goes back to the conditioning rack, not to the booth.',
        },
        after: ['Look across the panel, not at it'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'mix and load 2K lacquer',
    thing: 'Lacquer booth',
    photo: {
      ...photos.sprayBooth,
      step: 'Check extraction and protection before opening anything',
    },
    summary: 'Ratio, pot life and the sequence that avoids a cured gun.',
    difficulty: 'advanced',
    minutes: 40,
    needs: [
      { item: '2K polyurethane lacquer', role: 'use', quantity: 5, unit: 'l' },
      { item: 'Lacquer hardener', role: 'use', quantity: 0.5, unit: 'l' },
      { item: 'Cleaning solvent', role: 'use', quantity: 2, unit: 'l' },
    ],
    steps: [
      {
        title: 'Check extraction and protection before opening anything',
        text: 'Booth extraction running, air-fed mask on, before a lid comes off. Isocyanate hardener is not something to be casual about.',
        before: [
          { text: 'Booth extraction confirmed running.', tone: 'warning' },
          { text: 'Air-fed respirator, not a cartridge mask.', tone: 'warning' },
        ],
        panel: {
          tone: 'danger',
          text: 'Do not mix 2K outside the booth, and do not stay in the booth without air-fed breathing protection.',
        },
      },
      {
        title: 'Mix ten to one, by volume, in that order',
        text: 'Lacquer into the pot first, then hardener. Hardener first leaves a cured skin in the bottom that will not stir out.',
        uses: [
          { item: '2K polyurethane lacquer', quantity: 5 },
          { item: 'Lacquer hardener', quantity: 0.5 },
        ],
        after: ['Check extraction and protection before opening anything'],
      },
      {
        title: 'Write the mix time on the pot',
        text: 'Ninety minutes at 20 °C. A pot with no time on it is a pot nobody can trust, so it gets discarded.',
        after: ['Mix ten to one, by volume, in that order'],
      },
      {
        title: 'Flush the gun the moment the run ends',
        text: 'Solvent through the gun before the pot life expires, not after. A cured gun is a replacement, not a clean.',
        uses: [{ item: 'Cleaning solvent', quantity: 2 }],
        after: ['Write the mix time on the pot'],
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Lacquer booth',
    summary: 'Changing booth filters on pressure drop rather than on the calendar.',
    difficulty: 'moderate',
    minutes: 45,
    needs: [{ item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Read the pressure differential before shutting down',
        text: 'The gauge only means something with the fan running. Read it first, then isolate.',
      },
      {
        title: 'Change on the number, not the date',
        text: 'Filters are changed when the differential reaches 250 Pa. A filter changed early wastes money; one changed late puts overspray on the panels.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        after: ['Read the pressure differential before shutting down'],
        table: {
          headers: ['Differential', 'Action'],
          rows: [
            ['< 150 Pa', 'Normal'],
            ['150 – 250 Pa', 'Order filters'],
            ['> 250 Pa', 'Change before the next run'],
          ],
        },
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'gloss level',
    thing: 'Lacquer booth',
    summary: 'Measuring gloss at 60° and knowing which way a reading drifts.',
    difficulty: 'easy',
    minutes: 15,
    needs: [{ item: 'Gloss meter 60°', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Let the panel cure before measuring',
        text: 'Gloss climbs for the first two hours. A reading taken at the booth exit is not the reading the customer sees.',
        before: [{ text: 'Panel out of the booth for at least two hours.', tone: 'info' }],
      },
      {
        title: 'Five readings, spread out',
        text: 'Two along each long edge, one in the middle. The average is the result; the spread tells you whether the gun pass was even.',
        uses: [{ item: 'Gloss meter 60°', mode: 'reuse' }],
        table: {
          headers: ['Finish', 'Target at 60°', 'Tolerance'],
          rows: [
            ['Matt', '10 GU', '± 2 GU'],
            ['Satin', '35 GU', '± 3 GU'],
            ['Gloss', '85 GU', '± 5 GU'],
          ],
        },
        after: ['Let the panel cure before measuring'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'kit a fitting bag',
    thing: 'Fittings and hardware',
    summary: 'Counting by weight, checking by number, and why both are needed.',
    difficulty: 'easy',
    minutes: 20,
    needs: [
      { item: 'Beech dowel 8 × 35 mm', role: 'use', quantity: 16, unit: 'each' },
      { item: 'Cam housing 15 mm', role: 'use', quantity: 12, unit: 'each' },
    ],
    steps: [
      {
        title: 'Set the counting scale for the fitting',
        text: 'Each fitting has its own piece weight. Using yesterday’s setting is how a bag ends up with eleven cams.',
      },
      {
        title: 'Count by weight, verify one bag in twenty by hand',
        text: 'Weight is fast and drifts. A hand count every twentieth bag catches the drift before a pallet of it ships.',
        uses: [
          { item: 'Beech dowel 8 × 35 mm', quantity: 16 },
          { item: 'Cam housing 15 mm', quantity: 12 },
        ],
        after: ['Set the counting scale for the fitting'],
        panel: {
          tone: 'info',
          text: 'A short fitting bag is the single most common customer complaint on this range.',
        },
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'set the carton former for a gable pack',
    thing: 'Carton line',
    summary: 'Blank size, corner protection and the seal pattern for a long, heavy pack.',
    difficulty: 'moderate',
    minutes: 30,
    needs: [
      { item: 'Carton board, 3-ply', role: 'use', quantity: 1, unit: 'each' },
      { item: 'Polythene corner protector', role: 'use', quantity: 4, unit: 'each' },
    ],
    steps: [
      {
        title: 'Set the former to the blank size',
        text: 'A gable pack is long and narrow, and the former defaults to the drawer pack. Change it before the first blank goes through.',
      },
      {
        title: 'Corner protectors before the panel, not after',
        text: 'Four protectors, one per vertical edge, placed as the carton fills. Pushing them in afterwards tears the liner.',
        uses: [
          { item: 'Carton board, 3-ply', quantity: 1 },
          { item: 'Polythene corner protector', quantity: 4 },
        ],
        after: ['Set the former to the blank size'],
      },
      {
        title: 'Seal with a centre strip and two straps',
        text: 'Tape alone will not hold a 30 kg pack through a parcel network. Centre strip, then two straps at the third points.',
        after: ['Corner protectors before the panel, not after'],
      },
    ],
  },
  {
    type: 'inspection',
    subject: 'pack weight',
    thing: 'Label printer',
    summary: 'The last check before a pallet leaves: weight, label, and the two matching.',
    difficulty: 'easy',
    minutes: 10,
    needs: [{ item: 'Barcode label roll', role: 'use', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Weigh the pack and read the label',
        text: 'The printed weight and the scale should agree within 2 %. A disagreement means a wrong part in the carton, not a wrong scale.',
        uses: [{ item: 'Barcode label roll', quantity: 1 }],
        panel: {
          tone: 'warning',
          text: 'Never reprint a label to match the scale. Open the carton and find out why.',
        },
      },
      {
        title: 'Scan the barcode, do not read it',
        text: 'A label can be legible and unscannable. If the scanner will not read it in two attempts, the print head needs cleaning.',
        after: ['Weigh the pack and read the label'],
      },
    ],
  },
  {
    type: 'maintenance',
    subject: '',
    thing: 'Dust extraction',
    summary:
      'Filter cleaning and replacement on the main extraction unit, by pressure and by hours.',
    difficulty: 'moderate',
    minutes: 90,
    needs: [
      { item: 'Extraction filter cartridge', role: 'use', quantity: 16, unit: 'each' },
      { item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' },
    ],
    steps: [
      {
        title: 'Record the differential with the fan running',
        text: 'Same rule as the booth: the reading only means something under flow. Record it before anything is switched off.',
      },
      {
        title: 'Isolate, then wait for the fan to stop turning',
        text: 'A large extraction fan free-wheels for several minutes after isolation. The interlock does not know that.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        before: [{ text: 'Fan visibly stationary, not merely isolated.', tone: 'warning' }],
        after: ['Record the differential with the fan running'],
        panel: {
          tone: 'danger',
          text: 'Do not reach into the housing while the impeller is turning, however slowly.',
        },
      },
      {
        title: 'Replace all sixteen cartridges together',
        text: 'Mixed old and new cartridges means the new ones take the flow and load up early. They are replaced as a set.',
        uses: [{ item: 'Extraction filter cartridge', quantity: 16 }],
        after: ['Isolate, then wait for the fan to stop turning'],
      },
    ],
  },
  {
    type: 'how-to',
    subject: 'lock off a machine before working inside the guard',
    thing: 'Facilities and maintenance',
    summary:
      'The lockout sequence that applies to every machine in the building, without exception.',
    difficulty: 'easy',
    minutes: 15,
    needs: [{ item: 'Lockout padlock set', role: 'keep', quantity: 1, unit: 'each' }],
    steps: [
      {
        title: 'Tell the people who will notice it stop',
        text: 'A line stopping without warning gets restarted by someone trying to help. Say it out loud before you isolate.',
      },
      {
        title: 'Isolate, lock, tag',
        text: 'Your own padlock on the hasp, your own tag with your name and the time. One person, one padlock.',
        uses: [{ item: 'Lockout padlock set', mode: 'reuse' }],
        after: ['Tell the people who will notice it stop'],
        panel: {
          tone: 'danger',
          text: 'Never work under someone else’s lock, and never remove one that is not yours. Not once, not briefly.',
        },
      },
      {
        title: 'Prove dead by trying to start it',
        text: 'Press start. If anything moves, the isolator is not the right one. This step is the whole point of the other three.',
        after: ['Isolate, lock, tag'],
        panel: {
          tone: 'success',
          text: 'Start pressed, nothing moves, stored energy released: safe to open the guard.',
        },
      },
      {
        title: 'Release in reverse, and look before you do',
        text: 'Guards back, tools out, people clear, then your lock comes off last. Walk the machine before you restore power.',
        after: ['Prove dead by trying to start it'],
      },
    ],
  },
];
