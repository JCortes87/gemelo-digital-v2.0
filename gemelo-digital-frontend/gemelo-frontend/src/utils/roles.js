export const STUDENT_ROLES = ["estudiante ef", "student", "estudiante"];

export const isStudentRole = (rn) =>
  STUDENT_ROLES.some((sr) => String(rn || "").toLowerCase().includes(sr));

// FAIL-CLOSED (18 ago 2026): antes era "todo lo que no sea estudiante",
// lo que trataba como profesor cualquier rol desconocido. Ahora solo los
// roles docentes/administrativos explícitos cuentan como instructor.
export const INSTRUCTOR_ROLES = [
  "instructor", "profesor", "docente", "teacher", "facilitador",
  "coordinador", "admin",
];

export const isInstructorRole = (rn) => {
  const s = String(rn || "").toLowerCase();
  if (!s || isStudentRole(s)) return false;
  return INSTRUCTOR_ROLES.some((k) => s.includes(k));
};
