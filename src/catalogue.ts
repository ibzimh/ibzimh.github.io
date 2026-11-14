// The registry: one entry per collection. A new interest = one entry here + one folder in src/content/.
export interface CollectionDef {
  letter: string; // single capital letter, also the folder name in lowercase
  slug: string; // URL of the collection page
  name: string;
  blurb: string; // one line on the home page
  intro: string; // heading on the collection page
  kinds: readonly string[]; // allowed `kind` values
  show: 'writing' | 'project'; // meta style
}

export const collections = [
  {
    letter: 'W',
    slug: 'writing',
    name: 'Writing',
    blurb: 'some writing i did',
    intro: 'some writing i did',
    kinds: ['Essay', 'Note', 'Guide'],
    show: 'writing',
  },
  {
    letter: 'P',
    slug: 'projects',
    name: 'Projects',
    blurb: 'some projects of mine',
    intro: 'some projects of mine',
    kinds: ['Web app', 'Tool', 'Command line'],
    show: 'project',
  },
] as const satisfies readonly CollectionDef[];

export const statuses = ['Active', 'Done', 'Paused'] as const;
