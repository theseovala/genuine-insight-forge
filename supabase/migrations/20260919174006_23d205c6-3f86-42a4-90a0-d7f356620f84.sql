CREATE POLICY "Platform credentials are server only"
ON public.platform_credentials
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);