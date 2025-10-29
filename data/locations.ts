export type LocationOption = {
  id: string;
  name: string;
  plandayDepartmentId: string;
};

export const LOCATIONS: LocationOption[] = [
  { id: "admin-office", name: "Admin/ office", plandayDepartmentId: "128780" },
  { id: "cheese-factory", name: "Cheese Factory", plandayDepartmentId: "130783" },
  { id: "drivers", name: "Drivers", plandayDepartmentId: "130784" },
  { id: "fish-and-bubbles-fulham", name: "Fish and Bubbles - Fulham", plandayDepartmentId: "128787" },
  { id: "fish-and-bubbles-notting-hill", name: "Fish and Bubbles - Notting Hill", plandayDepartmentId: "128789" },
  { id: "kitchen-lab", name: "Kitchen Lab", plandayDepartmentId: "130782" },
  { id: "la-mia-mamma-battersea", name: "La Mia Mamma - Battersea", plandayDepartmentId: "130781" },
  { id: "la-mia-mamma-chelsea", name: "La Mia Mamma - Chelsea", plandayDepartmentId: "128791" },
  { id: "la-mia-mamma-hollywood-road", name: "La Mia Mamma - Hollywood Road", plandayDepartmentId: "128790" },
  { id: "la-mia-mamma-notting-hill", name: "La Mia Mamma - Notting Hill", plandayDepartmentId: "128785" },
  { id: "la-vineria", name: "La Vineria", plandayDepartmentId: "128788" },
  { id: "made-in-italy-kings-road", name: "Made in Italy - King's Road", plandayDepartmentId: "128786" }
];
