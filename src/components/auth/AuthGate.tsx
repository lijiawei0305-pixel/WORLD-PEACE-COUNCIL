/**
 * 登录 / 注册门户。展示在 needsLogin=true 时，整体使用 wpc 主界面的科技感风格：
 * - 顶部品牌标识与右上 TopBar 一致
 * - 卡片用 wpc-panel 切角线 + 青蓝光晕
 * - 登录 / 注册通过 tab 切换；注册成功后自动尝试登录（适配未开邮箱验证场景）
 *
 * 设计原则：
 * - 不在前端写任何业务规则；注册后由 Supabase Auth 触发 profile 自动建立 trigger
 *   （migrations/004_rls_and_profiles_trigger.sql），新玩家天然就拥有 0 局游戏，下次创建即从第 1 关开始。
 * - 错误信息走 Supabase Auth 原生消息，避免在前端做翻译表导致与后端语义错位。
 */
import { useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../../lib/apiClient';
import { useLanguage, type Language } from '../../lib/i18n';

type AuthMode = 'signin' | 'signup';

type AuthGateProps = {
  onAuthenticated: () => void;
};

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
  const { language, setLanguage, t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [infoText, setInfoText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: AuthMode) => {
    if (mode === next) return;
    setMode(next);
    setErrorText('');
    setInfoText('');
  };

  const switchLanguage = (next: Language) => {
    setLanguage(next);
    setErrorText('');
    setInfoText('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password || isSubmitting) return;

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorText(t('passwordMismatch'));
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setErrorText(t('passwordTooShort'));
      return;
    }

    setIsSubmitting(true);
    setErrorText('');
    setInfoText('');

    const supabase = getSupabaseClient();

    if (mode === 'signin') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        setErrorText(error?.message ?? t('signinFailed'));
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      onAuthenticated();
      return;
    }

    // signup 分支：创建账号；如果 Supabase 关闭了邮箱验证会直接返回 session，
    // 否则只返回 user，需要玩家去邮箱点链接后再回来登录。
    const signUpResult = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: t('brandRole') },
      },
    });

    if (signUpResult.error) {
      setErrorText(signUpResult.error.message);
      setIsSubmitting(false);
      return;
    }

    if (signUpResult.data.session) {
      setIsSubmitting(false);
      onAuthenticated();
      return;
    }

    // 未自动登录的两种情形：
    //   1. 项目开启了邮箱验证 → 走邮箱激活
    //   2. 项目关闭了邮箱验证但当前 SDK 行为返回了 user 而非 session → 兜底再 signIn 一次
    const fallbackSignIn = await supabase.auth.signInWithPassword({ email, password });
    if (!fallbackSignIn.error && fallbackSignIn.data.session) {
      setIsSubmitting(false);
      onAuthenticated();
      return;
    }

    setIsSubmitting(false);
    setMode('signin');
    setInfoText(t('signupSubmitted'));
  };

  const isSignup = mode === 'signup';

  return (
    <main className="wpc-auth-shell" aria-label={language === 'en' ? 'Sign in or register' : '登录注册'}>
      <div className="space-bg" aria-hidden="true" />
      <div className="wpc-auth-frame">
        <header className="wpc-auth-header">
          <div className="wpc-brand wpc-auth-brand">
            <div className="wpc-brand__mark" aria-hidden="true">
              <img src="/assets/icons/wpc/world-peace-council.svg" alt="" />
            </div>
            <div className="wpc-brand__copy">
              <h1>{t('brand')}</h1>
              <span>WORLD PEACE COUNCIL</span>
            </div>
          </div>
          <p className="wpc-auth-tagline">{t('authTagline')}</p>
        </header>

        <section className="wpc-auth-card" aria-label={isSignup ? t('signup') : t('signin')}>
          <div className="wpc-language-switch" aria-label={t('authLanguage')}>
            <span>{t('authLanguage')}</span>
            <div>
              <button
                type="button"
                className={language === 'zh' ? 'wpc-language-switch__button wpc-language-switch__button--active' : 'wpc-language-switch__button'}
                aria-pressed={language === 'zh'}
                onClick={() => switchLanguage('zh')}
              >
                中文
              </button>
              <button
                type="button"
                className={language === 'en' ? 'wpc-language-switch__button wpc-language-switch__button--active' : 'wpc-language-switch__button'}
                aria-pressed={language === 'en'}
                onClick={() => switchLanguage('en')}
              >
                English
              </button>
            </div>
          </div>

          <div className="wpc-auth-tabs" role="tablist" aria-label={language === 'en' ? 'Sign in or register' : '登录或注册'}>
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={`wpc-auth-tab${!isSignup ? ' wpc-auth-tab--active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              {t('signin')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={`wpc-auth-tab${isSignup ? ' wpc-auth-tab--active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              {t('signup')}
            </button>
          </div>

          <form className="wpc-auth-form" onSubmit={handleSubmit} noValidate>
            <label className="wpc-auth-field">
              <span>{t('email')}</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="commander@example.com"
              />
            </label>

            <label className="wpc-auth-field">
              <span>{t('password')}</span>
              <input
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={isSignup ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? t('passwordSignupPlaceholder') : t('passwordSigninPlaceholder')}
              />
            </label>

            {isSignup ? (
              <label className="wpc-auth-field">
                <span>{t('confirmPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('confirmPasswordPlaceholder')}
                />
              </label>
            ) : null}

            {errorText ? (
              <p className="wpc-auth-message wpc-auth-message--error" role="alert">
                {errorText}
              </p>
            ) : null}
            {infoText ? (
              <p className="wpc-auth-message wpc-auth-message--info" role="status">
                {infoText}
              </p>
            ) : null}

            <button
              type="submit"
              className="wpc-console-button wpc-console-button--primary wpc-auth-submit"
              disabled={isSubmitting || !email || !password || (isSignup && !confirmPassword)}
            >
              {isSubmitting ? (isSignup ? t('submittingSignup') : t('submittingSignin')) : isSignup ? t('signupSubmit') : t('signin')}
            </button>

            <p className="wpc-auth-hint">
              {isSignup ? (
                <>
                  {t('haveAccount')}{' '}
                  <button type="button" className="wpc-auth-linklike" onClick={() => switchMode('signin')}>
                    {t('switchSignin')}
                  </button>
                </>
              ) : (
                <>
                  {t('firstTime')}{' '}
                  <button type="button" className="wpc-auth-linklike" onClick={() => switchMode('signup')}>
                    {t('createAccount')}
                  </button>
                </>
              )}
            </p>
          </form>
        </section>

        <footer className="wpc-auth-footnote">
          {t('authFootnote')}
        </footer>
      </div>
    </main>
  );
}
