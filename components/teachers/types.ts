export type Teacher = {
  id: string;
  name: string;
  email: string;
  classId: string;
  className: string;
  beaconId: string;
};

export type ClassOption = { id: string; name: string };

export type FormState = {
  name: string;
  email: string;
  classId: string;
  beaconId: string;
};

export const emptyForm: FormState = { name: '', email: '', classId: '', beaconId: '' };
