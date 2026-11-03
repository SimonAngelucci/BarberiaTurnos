-- Protección anti-overbooking a nivel base de datos.
-- Dos turnos activos del mismo barbero no pueden solaparse, ni con requests concurrentes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS appointment_no_overlap;
ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist ("barberId" WITH =, tsrange("startAt", "endAt") WITH &&)
  WHERE ("status" <> 'CANCELLED');
