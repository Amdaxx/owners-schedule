/**
 * This is our main app component - it brings everything together
 * Sets up the layout and makes sure keyboard shortcuts work
 */

import { useSelector } from 'react-redux';
import Header from './components/Header';
import BigCalendar from './components/BigCalendar';
import EventModal from './components/EventModal';
import { selectModalOpen } from './features/ui/slice';
import { selectSelectedWeek, selectTimezone } from './features/calendar/slice';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const modalOpen = useSelector(selectModalOpen);
  const selectedWeek = useSelector(selectSelectedWeek);
  const timezone = useSelector(selectTimezone);


  // Turn on keyboard shortcuts so people can navigate with their keyboard
  useKeyboardShortcuts({ selectedWeek, timezone });

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <BigCalendar />
      </main>
      {modalOpen && <EventModal />}
    </div>
  );
}

export default App;
