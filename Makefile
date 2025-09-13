# Makefile for Owner's Schedule monorepo

.PHONY: be-setup be-run be-seed be-test fe-setup fe-run fe-build help

# Backend commands
be-setup:
	@echo "Setting up backend..."
	cd backend && python -m venv venv
	cd backend && . venv/bin/activate && pip install -r requirements.txt
	cd backend && . venv/bin/activate && python manage.py makemigrations
	cd backend && . venv/bin/activate && python manage.py migrate
	@echo "Backend setup complete!"

be-run:
	@echo "Starting Django development server..."
	cd backend && . venv/bin/activate && python manage.py runserver

be-seed:
	@echo "Seeding calendar with sample data..."
	cd backend && . venv/bin/activate && python manage.py seed_calendar

be-test:
	@echo "Running backend tests..."
	cd backend && . venv/bin/activate && python manage.py test

# Frontend commands
fe-setup:
	@echo "Setting up frontend..."
	cd frontend && npm install
	@echo "Frontend setup complete!"

fe-run:
	@echo "Starting Vite development server..."
	cd frontend && npm run dev

fe-build:
	@echo "Building frontend for production..."
	cd frontend && npm run build

# Combined commands
setup: be-setup fe-setup
	@echo "Full setup complete! Run 'make be-run' and 'make fe-run' in separate terminals."

help:
	@echo "Available commands:"
	@echo "  be-setup  - Set up backend (venv, deps, migrations)"
	@echo "  be-run    - Start Django development server"
	@echo "  be-seed   - Seed database with sample data"
	@echo "  be-test   - Run backend tests"
	@echo "  fe-setup  - Set up frontend (npm install)"
	@echo "  fe-run    - Start Vite development server"
	@echo "  fe-build  - Build frontend for production"
	@echo "  setup     - Set up both backend and frontend"
	@echo "  help      - Show this help message"
