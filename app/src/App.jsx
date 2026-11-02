import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './state/AppContext'
import { Shell } from './components/Shell'
import { DashboardPage } from './pages/DashboardPage'
import { SectionPage } from './pages/SectionPage'
import { LecturePage } from './pages/LecturePage'
import { QuizzesPage } from './pages/QuizzesPage'
import { QuizPage } from './pages/QuizPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { GlossaryPage } from './pages/GlossaryPage'
import { NotesPage } from './pages/NotesPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Hash routing keeps the built app working from any static folder.
export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="section/:id" element={<SectionPage />} />
            <Route path="lecture/:id" element={<LecturePage />} />
            <Route path="quizzes" element={<QuizzesPage />} />
            <Route path="quiz/:id" element={<QuizPage />} />
            <Route path="flashcards" element={<FlashcardsPage />} />
            <Route path="glossary" element={<GlossaryPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
