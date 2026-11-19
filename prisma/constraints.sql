-- Protección contra doble reserva a nivel base de datos.
-- Dos turnos activos del mismo profesional no pueden empezar a la MISMA hora, ni con requests simultáneos.
-- (Antes se rechazaba cualquier solapamiento de horarios; ahora el administrador decide qué horarios ofrece, aunque un
-- turno largo se cruce con el horario siguiente, así que lo único que se impide es repetir la misma hora de inicio.)
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS appointment_no_overlap;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_one_per_start
  ON "Appointment" ("barberId", "startAt")
  WHERE "status" <> 'CANCELLED';
