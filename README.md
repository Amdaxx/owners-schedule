
### Backend Setup

1. Navigate to the backend directory
2. Create and activate a virtual environment
3. Install dependencies with `pip install -r requirements.txt`
4. Run migrations with `python manage.py migrate`
5. Start the server with `python manage.py runserver`

**Windows users:** Use `.\venv\Scripts\python.exe manage.py runserver`

### Frontend Setup

1. Navigate to the frontend directory
2. Install dependencies with `npm install`
3. Start the development server with `npm run dev`



## How It Works

### Data Model

The core idea is separating event series from individual occurrences:

**EventSeries** stores the recurring event definition with title, start time, duration, recurrence pattern, timezone, and optional fields like links and notes.

**EventException** handles individual occurrence overrides, allowing you to modify or delete specific instances of a recurring event without affecting the series.

### Recurrence Logic

When creating a recurring event, the backend generates individual occurrences using python-dateutil's RRULE. The system first generates base occurrences based on the recurrence pattern, then applies any exceptions (overrides and deletions) to create the final occurrence list.

### Timezone Handling

The approach:

**Store everything in UTC** in the database
**Convert to local time** on the frontend for display
**Always send UTC** back to the server

The frontend uses Luxon to handle timezone conversions, converting UTC times to local timezone for display and converting local times back to UTC for API calls.

### Exception Handling

When you edit an event, you get three options:

**"Edit this event only"** - Creates an EventException that overrides just this occurrence
**"Edit all future events"** - Splits the series at this point and creates an exception
**"Edit all events"** - Updates the entire EventSeries

The split logic creates a new series starting from the edit point and marks the old series as ending before the split.

## Frontend Architecture

### State Management

Using Redux Toolkit with a simple structure that includes selectedWeek, timezone, cached occurrences by week, loading state, and error handling. The cache key includes the week range and timezone to avoid stale data when switching timezones.

### Event Display

The calendar uses react-big-calendar with custom event components. The tricky part was handling overlapping events. The system calculates the total number of overlapping events and positions them side by side with appropriate width and positioning calculations.

## Key Architectural Decisions

### Why Separate EventSeries and EventException?

**The Problem:** Recurring events need to handle both the series definition and individual overrides. You could store every occurrence as a separate record, but that gets messy with "edit all future" operations.

**The Solution:** Keep the series definition separate from exceptions. This makes it easy to:
- Update the entire series (change the EventSeries)
- Update future occurrences (split the series + create exception)
- Update single occurrences (create EventException)

**Trade-off:** More complex queries, but much cleaner data model and easier to reason about.

### Why UTC Storage + Client-Side Timezone Conversion?

**The Problem:** DST transitions, different timezone libraries, server vs client timezone mismatches.

**The Solution:** Store everything in UTC, convert to local time on the frontend.

**Why this works:**
- Database is timezone-agnostic
- No server-side timezone conversion bugs
- Client can handle DST transitions properly
- Cache keys are consistent (always UTC)

**Trade-off:** More frontend complexity, but eliminates a whole class of timezone bugs.

### Why Redux Instead of React State?

**The Problem:** Calendar state is complex - selected week, timezone, cached occurrences, loading states. Passing this through props gets messy.

**The Solution:** Redux Toolkit for centralized state management.

**Why this works:**
- Single source of truth for calendar state
- Easy to debug with Redux DevTools
- Optimistic updates are straightforward
- Cache management is centralized

**Trade-off:** More boilerplate, but much better for complex state.

### Why react-big-calendar Instead of Building Custom?

**The Problem:** Calendar UI is complex - drag and drop, time slot rendering, event positioning, overlap handling.

**The Solution:** Use react-big-calendar as the foundation, customize the parts we need.

**Why this works:**
- Handles the complex calendar logic
- Good drag and drop support
- Extensible event rendering
- Battle-tested library

**Trade-off:** Less control over styling, but saves months of development time.

### Why Luxon Instead of Moment.js?

**The Problem:** Moment.js is deprecated and has timezone handling issues.

**The Solution:** Luxon for all date/time operations.

**Why this works:**
- Better timezone support
- Immutable API (no accidental mutations)
- Smaller bundle size
- Active development

**Trade-off:** Different API, but much better long-term choice.

## Challenges Solved

### The Midnight Bug

Early on, events with the same start time were showing up at midnight instead of their actual time. This was caused by the overlap styling using `position: absolute` which overrode react-big-calendar's layout engine. Fixed by removing the absolute positioning and letting the library handle vertical placement.


### Timezone Consistency

Making sure drag-and-drop, editing, and timezone switching all work together was tricky. The solution was to always use UTC for API calls and cache keys, then convert to local time only for display.



## What Could Be Done Better

### Code Quality & Architecture

**Error Handling:**
- Currently basic try/catch blocks - could implement proper error boundaries
- No centralized error logging or monitoring
- API errors could be more user-friendly with specific error codes
- Missing validation for edge cases (like invalid timezone strings)

**State Management:**
- Redux state could be more normalized (currently nested objects)
- No optimistic updates for better UX during network delays
- Cache invalidation strategy is basic it could be more sophisticated
- Missing state persistence for user preferences

**Code Organization:**
- Some components are too large (BigCalendar.tsx is 600+ lines)
- Business logic mixed with UI components in places
- Could benefit from more custom hooks to extract reusable logic
- Type definitions could be more strict (some `any` types still exist)

### Performance & Scalability

**Frontend Performance:**
- No virtual scrolling for large event lists (could be slow with 1000+ events)
- Event overlap calculations run on every render - could be memoized better
- No lazy loading for calendar components
- Bundle size could be optimized (some unused dependencies)

**Backend Performance:**
- No database indexing strategy for date range queries
- Recurrence expansion could be cached to avoid recalculating
- No pagination for large occurrence sets
- Missing database connection pooling configuration

**Caching Strategy:**
- Simple in-memory cache that doesn't persist across server restarts
- No cache invalidation for related data changes
- Could implement Redis for distributed caching
- No cache warming strategy for frequently accessed data

### User Experience

**Accessibility:**
- Missing ARIA labels for screen readers
- Color contrast could be improved for better accessibility
- No focus management for modal dialogs

**User Interface:**
- No loading skeletons - just basic spinners
- Error states are generic and not helpful
- No undo/redo functionality (removed due to complexity)
- Drag and drop could have better visual feedback


### Data & Security

**Data Validation:**
- Frontend validation is basic - could be more comprehensive
- No server-side rate limiting for API endpoints
- Missing input sanitization for user-generated content
- No data migration strategy for schema changes

**Security Gaps:**
- Missing CSRF protection configuration
- No audit logging for data changes
- Environment variables not properly secured in production

### Testing & Quality

**Test Coverage:**
- Currently no tests implemented (this is a major gap)
- No automated testing pipeline
- Missing integration tests for complex workflows
- No performance testing for large datasets

**Code Quality:**
- No linting rules enforced
- No automated code quality checks

### Infrastructure 

**Database:**
- No database migrations strategy
- Missing backup and recovery procedures
- No database performance monitoring
- Could benefit from read replicas for scaling

## What I'd Do Next

Given more time, I'd prioritize:

1. **Testing Infrastructure** - Implement comprehensive test suite with 80%+ coverage
2. **Error Handling** - Proper error boundaries, logging, and user-friendly messages
3. **Performance Optimization** - Virtual scrolling, better caching, database indexing
4. **Code Refactoring** - Break down large components, extract business logic
5. **Accessibility** - ARIA labels, keyboard navigation, screen reader support
6. **Security Hardening** - Authentication, rate limiting, input validation
7. **Mobile Support** - Responsive design and touch interactions
8. **DevOps Setup** - Docker, CI/CD, monitoring, and deployment automation

## What's Missing

- Event reminders/notifications
- Bulk import/export
- More complex recurrence patterns (monthly, yearly)
- Team/sharing features

## Testing Strategy

### Backend Testing (Django)

**Unit Tests** would cover recurrence patterns, timezone handling including DST transitions, and exception handling for single occurrence edits.

**Integration Tests** would verify API endpoints, timezone conversion accuracy, and end-to-end data flow.

**Test Coverage** should include models validation, API endpoints, services, and edge cases like DST transitions and leap years.

### Frontend Testing (React + Jest)

**Component Tests** would verify calendar display, event rendering, and drag-and-drop functionality.

**Redux Testing** would ensure state management works correctly with proper action handling and state updates.

**Custom Hooks Testing** would verify timezone conversion logic and other utility functions.

**E2E Testing** with Playwright would test complete user workflows like creating recurring events.

### Testing Libraries & Tools

**Backend:** Django TestCase, pytest-django, factory-boy, coverage.py

**Frontend:** Jest, React Testing Library, @testing-library/user-event, MSW, Playwright

### Test Data Management

**Backend Fixtures** using factory-boy for generating test data

**Frontend Mocks** using MSW for API mocking and consistent test data



## Security Considerations

### Authentication & Authorization
Currently the application runs without authentication for simplicity, but in production you'd want to implement:

- **JWT-based authentication** (RFC 7519) for stateless sessions
- **Role-based access control** (RBAC) for different user permissions
- **Session management** with proper expiration and refresh tokens
- **Multi-factor authentication** (MFA) for sensitive operations

### Data Protection
- **Input validation** on all API endpoints to prevent injection attacks
- **SQL injection prevention** using Django ORM parameterized queries
- **XSS protection** with proper content sanitization
- **CSRF protection** enabled by default in Django

### API Security
- **Rate limiting** to prevent abuse (Django REST Framework throttling)
- **CORS configuration** properly set for production domains
- **API versioning** to maintain backward compatibility
- **Request/response logging** for audit trails

### Data Privacy (GDPR/CCPA Compliance)
- **Data minimization** - only store necessary user data
- **Right to deletion** - implement user data export/deletion endpoints
- **Data encryption** at rest (PostgreSQL encryption) and in transit (HTTPS)
- **Audit logging** for data access and modifications

### Infrastructure Security
- **Environment variable management** - never commit secrets to version control
- **Database security** - use connection pooling and encrypted connections
- **HTTPS enforcement** in production with proper SSL/TLS configuration
- **Security headers** (HSTS, CSP, X-Frame-Options) via Django middleware

### Security Standards Compliance
- **OWASP Top 10** - protection against common web vulnerabilities
- **ISO 27001** - information security management system principles
- **SOC 2 Type II** - security, availability, and confidentiality controls
- **NIST Cybersecurity Framework** - identify, protect, detect, respond, recover