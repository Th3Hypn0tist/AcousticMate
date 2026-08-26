# Acoustics domain

This directory contains reusable, instantiable acoustic structures and visualizations. Acoustic vocabulary is allowed. Host-application ownership is not.

Every module must work without its originating application, own no application-global state and depend only on S3D core or explicitly declared lower-level utilities. Consumers instantiate and wire these modules themselves.
